import { corsHeaders, requireSuperAdmin, serviceClient } from '../_shared/email-bulk.ts';
import { BulkSmsContact, boundedText, getSmsMetrics, normalizeExternalPhone } from '../_shared/bulk-sms.ts';
import { sendSms } from '../_shared/at-sms.ts';
import { consumeRateLimit } from '../_shared/rate-limit.ts';

const MAX_RECIPIENTS = 5000;
const MAX_SEGMENTS = 6;
const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 75;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

type ActionBody = {
  action?: 'preview' | 'queue' | 'cancel' | 'retry_failed' | 'resume' | 'worker';
  campaign_id?: string;
  campaign_name?: string;
  message?: string;
  source_type?: 'manual' | 'upload' | 'contact_list' | 'duplicate';
  list_id?: string;
  recipients?: BulkSmsContact[];
};

type RecipientInsert = {
  campaign_id: string;
  external_contact_id: string | null;
  business_name: string | null;
  contact_name: string | null;
  phone_number: string;
  normalized_phone_number: string | null;
  status: 'pending' | 'invalid' | 'duplicate' | 'suppressed';
  excluded_reason: string | null;
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isInternalWorker(req: Request) {
  const authorization = req.headers.get('Authorization') ?? '';
  return Boolean(SERVICE_ROLE_KEY) && authorization === `Bearer ${SERVICE_ROLE_KEY}`;
}

async function audit(
  action: string,
  actor: { userId: string; email: string | null },
  campaignId: string,
  details: Record<string, unknown> = {},
) {
  const admin = serviceClient();
  const { error } = await admin.from('platform_audit_log').insert({
    action,
    details: { campaign_id: campaignId, ...details },
    performed_by: actor.userId,
    performed_by_email: actor.email,
  });
  if (error) console.error('[admin-bulk-sms] audit insert failed', { code: error.code, action });
}

async function loadListContacts(listId: string): Promise<BulkSmsContact[]> {
  const admin = serviceClient();
  const rows: BulkSmsContact[] = [];
  for (let from = 0; from < MAX_RECIPIENTS; from += 1000) {
    const { data, error } = await admin
      .from('external_contacts')
      .select('id, phone_number, contact_name, business_name, sms_opt_out')
      .eq('list_id', listId)
      .order('created_at', { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    for (const row of data ?? []) {
      rows.push({
        phone: String(row.phone_number ?? ''),
        contactName: row.contact_name,
        businessName: row.business_name,
        externalContactId: row.id,
        optedOut: Boolean(row.sms_opt_out),
      });
    }
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

async function suppressedNumbers(numbers: string[]) {
  const admin = serviceClient();
  const suppressed = new Set<string>();
  for (let index = 0; index < numbers.length; index += 400) {
    const chunk = numbers.slice(index, index + 400);
    const [{ data: global }, { data: contacts }] = await Promise.all([
      admin.from('sms_suppressions').select('normalized_phone_number').in('normalized_phone_number', chunk),
      admin.from('external_contacts').select('normalized_phone_number').eq('sms_opt_out', true).in('normalized_phone_number', chunk),
    ]);
    for (const row of global ?? []) suppressed.add(String(row.normalized_phone_number));
    for (const row of contacts ?? []) suppressed.add(String(row.normalized_phone_number));
  }
  return suppressed;
}

async function createPreview(body: ActionBody, actor: { userId: string; email: string | null }) {
  const name = String(body.campaign_name ?? '').trim();
  const message = String(body.message ?? '').trim();
  if (!name || name.length > 160) return json({ error: 'campaign_name_required' }, 400);
  if (!message) return json({ error: 'message_required' }, 400);

  const metrics = getSmsMetrics(message);
  if (metrics.segments > MAX_SEGMENTS) {
    return json({ error: 'message_too_long', max_segments: MAX_SEGMENTS }, 413);
  }

  let contacts: BulkSmsContact[];
  if (body.source_type === 'contact_list') {
    if (!body.list_id) return json({ error: 'contact_list_required' }, 400);
    contacts = await loadListContacts(body.list_id);
  } else {
    contacts = Array.isArray(body.recipients) ? body.recipients : [];
  }
  if (contacts.length === 0) return json({ error: 'recipients_required' }, 400);
  if (contacts.length > MAX_RECIPIENTS) return json({ error: 'recipient_limit_exceeded', limit: MAX_RECIPIENTS }, 413);

  const normalized = contacts.map((contact) => normalizeExternalPhone(contact.phone));
  const validNumbers = Array.from(new Set(normalized.filter((value): value is string => Boolean(value))));
  const suppressed = await suppressedNumbers(validNumbers);
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  let excluded = 0;
  let finalCount = 0;

  const admin = serviceClient();
  const senderId = (Deno.env.get('AT_SENDER_ID') ?? '').trim() || null;
  const { data: campaign, error: campaignError } = await admin
    .from('bulk_sms_campaigns')
    .insert({
      name,
      message,
      status: 'draft',
      source_type: body.source_type ?? 'manual',
      source_list_id: body.source_type === 'contact_list' ? body.list_id : null,
      sender_id: senderId,
      encoding: metrics.encoding,
      message_characters: metrics.characters,
      segments_per_recipient: metrics.segments,
      total_rows: contacts.length,
      created_by: actor.userId,
      created_by_email: actor.email,
    })
    .select('id')
    .single();
  if (campaignError || !campaign) throw campaignError ?? new Error('campaign_create_failed');

  const rows: RecipientInsert[] = contacts.map((contact, index) => {
    const phone = String(contact.phone ?? '').trim().slice(0, 80);
    const number = normalized[index];
    let status: RecipientInsert['status'] = 'pending';
    let excludedReason: string | null = null;
    if (!number) {
      status = 'invalid';
      excludedReason = 'invalid_phone_number';
      invalid += 1;
    } else if (seen.has(number)) {
      status = 'duplicate';
      excludedReason = 'duplicate_in_campaign';
      duplicates += 1;
    } else if (contact.optedOut || suppressed.has(number)) {
      status = 'suppressed';
      excludedReason = 'do_not_sms';
      excluded += 1;
      seen.add(number);
    } else {
      seen.add(number);
      finalCount += 1;
    }
    return {
      campaign_id: campaign.id,
      external_contact_id: contact.externalContactId ?? null,
      business_name: boundedText(contact.businessName, 180),
      contact_name: boundedText(contact.contactName, 180),
      phone_number: phone || '(blank)',
      normalized_phone_number: number,
      status,
      excluded_reason: excludedReason,
    };
  });

  try {
    for (let index = 0; index < rows.length; index += 500) {
      const { error } = await admin.from('bulk_sms_recipients').insert(rows.slice(index, index + 500));
      if (error) throw error;
    }
    const { error: updateError } = await admin
      .from('bulk_sms_campaigns')
      .update({
        total_recipients: finalCount,
        total_valid: validNumbers.length,
        total_invalid: invalid,
        total_duplicates: duplicates,
        total_excluded: excluded,
        total_pending: finalCount,
        estimated_total_segments: finalCount * metrics.segments,
      })
      .eq('id', campaign.id);
    if (updateError) throw updateError;
  } catch (error) {
    await admin.from('bulk_sms_campaigns').delete().eq('id', campaign.id);
    throw error;
  }

  await audit('bulk_sms_campaign_created', actor, campaign.id, {
    total_rows: contacts.length,
    recipients: finalCount,
    invalid,
    duplicates,
    excluded,
  });
  return json({
    ok: true,
    campaign_id: campaign.id,
    provider: 'Africa\'s Talking',
    sender_id: senderId || 'Provider default',
    total_rows: contacts.length,
    valid_numbers: validNumbers.length,
    invalid_numbers: invalid,
    duplicate_numbers: duplicates,
    excluded_numbers: excluded,
    recipient_count: finalCount,
    characters: metrics.characters,
    encoding: metrics.encoding,
    segments_per_recipient: metrics.segments,
    estimated_total_segments: finalCount * metrics.segments,
    estimated_cost: null,
  });
}

async function invokeWorker(campaignId: string) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('worker_configuration_missing');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-bulk-sms`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'worker', campaign_id: campaignId }),
  });
  if (!response.ok) console.error('[admin-bulk-sms] worker chain failed', { status: response.status, campaignId });
}

function continueInBackground(campaignId: string) {
  const promise = invokeWorker(campaignId).catch((error) => {
    console.error('[admin-bulk-sms] worker invocation failed', {
      campaignId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  });
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (value: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise;
}

async function queueCampaign(campaignId: string, actor: { userId: string; email: string | null }, retry = false) {
  const admin = serviceClient();
  const allowed = retry ? ['completed', 'partially_completed', 'failed'] : ['draft'];
  const { data: campaign } = await admin
    .from('bulk_sms_campaigns')
    .select('id, status, total_recipients')
    .eq('id', campaignId)
    .in('status', allowed)
    .maybeSingle();
  if (!campaign) return json({ error: retry ? 'campaign_not_retryable' : 'campaign_not_queueable' }, 409);

  if (retry) {
    const { data: failedRows, error: failedError } = await admin
      .from('bulk_sms_recipients')
      .update({
        status: 'pending',
        error_message: null,
        provider_status: null,
        provider_message_id: null,
        processing_token: null,
        locked_at: null,
      })
      .eq('campaign_id', campaignId)
      .in('status', ['failed', 'rejected', 'expired'])
      .select('id');
    if (failedError) throw failedError;
    if (!failedRows?.length) return json({ error: 'no_failed_recipients' }, 409);
  } else if (!campaign.total_recipients) {
    return json({ error: 'no_sendable_recipients' }, 409);
  }

  const { error } = await admin.from('bulk_sms_campaigns').update({
    status: 'queued',
    completed_at: null,
    cancelled_at: null,
    last_error: null,
  }).eq('id', campaignId);
  if (error) throw error;
  await audit(retry ? 'bulk_sms_failed_recipients_retried' : 'bulk_sms_campaign_queued', actor, campaignId);
  continueInBackground(campaignId);
  return json({ ok: true, campaign_id: campaignId, status: 'queued' }, 202);
}

async function cancelCampaign(campaignId: string, actor: { userId: string; email: string | null }) {
  const admin = serviceClient();
  const { data: campaign } = await admin
    .from('bulk_sms_campaigns')
    .select('status')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) return json({ error: 'campaign_not_found' }, 404);
  if (['completed', 'partially_completed', 'failed', 'cancelled'].includes(campaign.status)) {
    return json({ error: 'campaign_not_cancellable' }, 409);
  }
  const { error: campaignError } = await admin.from('bulk_sms_campaigns').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
  }).eq('id', campaignId).in('status', ['draft', 'queued', 'sending']);
  if (campaignError) throw campaignError;
  const { error: recipientError } = await admin.from('bulk_sms_recipients').update({
    status: 'cancelled',
    processing_token: null,
    locked_at: null,
  }).eq('campaign_id', campaignId).in('status', ['pending', 'processing']);
  if (recipientError) throw recipientError;
  await audit('bulk_sms_campaign_cancelled', actor, campaignId);
  return json({ ok: true, status: 'cancelled' });
}

async function resumeCampaign(campaignId: string, actor: { userId: string; email: string | null }) {
  const admin = serviceClient();
  const { data: campaign } = await admin.from('bulk_sms_campaigns')
    .select('id, status, total_pending').eq('id', campaignId).in('status', ['queued', 'sending']).maybeSingle();
  if (!campaign || !campaign.total_pending) return json({ error: 'campaign_not_resumable' }, 409);
  await audit('bulk_sms_campaign_resumed', actor, campaignId);
  continueInBackground(campaignId);
  return json({ ok: true, status: campaign.status }, 202);
}

async function processWorker(campaignId: string) {
  const admin = serviceClient();
  const { data: campaign } = await admin
    .from('bulk_sms_campaigns')
    .select('id, message, status, started_at, created_by, created_by_email')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign || !['queued', 'sending'].includes(campaign.status)) return json({ ok: true, skipped: true });

  if (campaign.status === 'queued') {
    await admin.from('bulk_sms_campaigns').update({
      status: 'sending',
      started_at: campaign.started_at ?? new Date().toISOString(),
    }).eq('id', campaignId).eq('status', 'queued');
  }

  const processingToken = crypto.randomUUID();
  const { data: rows, error: claimError } = await admin.rpc('claim_bulk_sms_recipients', {
    _campaign_id: campaignId,
    _batch_size: BATCH_SIZE,
    _processing_token: processingToken,
  });
  if (claimError) throw claimError;

  for (const row of rows ?? []) {
    const { data: liveCampaign, error: liveCampaignError } = await admin
      .from('bulk_sms_campaigns')
      .select('status')
      .eq('id', campaignId)
      .maybeSingle();
    if (liveCampaignError) throw liveCampaignError;
    if (!liveCampaign || !['queued', 'sending'].includes(liveCampaign.status)) {
      await admin.from('bulk_sms_recipients').update({
        status: 'cancelled',
        processing_token: null,
        locked_at: null,
      }).eq('campaign_id', campaignId).eq('processing_token', processingToken);
      break;
    }
    try {
      const result = await sendSms({ to: row.normalized_phone_number, message: campaign.message });
      if (result.dryRun) throw new Error('SMS delivery is disabled');
      const provider = result.recipient as { messageId?: string; status?: string; cost?: string } | undefined;
      const { error } = await admin.from('bulk_sms_recipients').update({
        status: 'sent',
        provider_message_id: provider?.messageId ?? null,
        provider_status: provider?.status ?? 'Success',
        provider_cost: provider?.cost ?? null,
        error_message: null,
        sent_at: new Date().toISOString(),
        processing_token: null,
        locked_at: null,
      }).eq('id', row.id).eq('processing_token', processingToken);
      if (error) throw error;
    } catch (error) {
      await admin.from('bulk_sms_recipients').update({
        status: 'failed',
        error_message: (error instanceof Error ? error.message : 'SMS provider error').slice(0, 500),
        processing_token: null,
        locked_at: null,
      }).eq('id', row.id).eq('processing_token', processingToken);
    }
    await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
  }

  const { data: refreshed, error: refreshError } = await admin.rpc('refresh_bulk_sms_campaign', {
    _campaign_id: campaignId,
  });
  if (refreshError) throw refreshError;
  const refreshedCampaign = Array.isArray(refreshed) ? refreshed[0] : refreshed;
  if (refreshedCampaign?.status === 'sending' && Number(refreshedCampaign.total_pending) > 0) continueInBackground(campaignId);
  else if (['completed', 'partially_completed', 'failed'].includes(refreshedCampaign?.status ?? '') && (rows?.length ?? 0) > 0) {
    await admin.from('platform_audit_log').insert({
      action: 'bulk_sms_campaign_processing_completed',
      details: {
        campaign_id: campaignId,
        status: refreshedCampaign.status,
        sent: refreshedCampaign.total_sent,
        delivered: refreshedCampaign.total_delivered,
        failed: refreshedCampaign.total_failed,
      },
      performed_by: campaign.created_by,
      performed_by_email: campaign.created_by_email,
    });
  }
  return json({ ok: true, processed: rows?.length ?? 0, status: refreshedCampaign?.status ?? 'unknown' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({})) as ActionBody;
    if (body.action === 'worker') {
      if (!isInternalWorker(req)) return json({ error: 'forbidden' }, 403);
      if (!body.campaign_id) return json({ error: 'campaign_id_required' }, 400);
      return await processWorker(body.campaign_id);
    }

    const guard = await requireSuperAdmin(req);
    if (guard instanceof Response) return guard;
    const allowed = await consumeRateLimit({
      req,
      action: `admin_bulk_sms_${body.action ?? 'unknown'}`,
      entity: guard.userId,
      keyScope: 'entity',
      limit: body.action === 'preview' ? 30 : 10,
      windowSeconds: 60,
    });
    if (!allowed) return json({ error: 'rate_limited' }, 429);

    if (body.action === 'preview') return await createPreview(body, guard);
    if (!body.campaign_id) return json({ error: 'campaign_id_required' }, 400);
    if (body.action === 'queue') return await queueCampaign(body.campaign_id, guard, false);
    if (body.action === 'retry_failed') return await queueCampaign(body.campaign_id, guard, true);
    if (body.action === 'resume') return await resumeCampaign(body.campaign_id, guard);
    if (body.action === 'cancel') return await cancelCampaign(body.campaign_id, guard);
    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    console.error('[admin-bulk-sms] request failed', {
      code: code ?? 'unknown',
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'request_failed' }, 500);
  }
});
