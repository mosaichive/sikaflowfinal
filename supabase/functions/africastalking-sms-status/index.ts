import { serviceClient } from '../_shared/email-bulk.ts';

const WEBHOOK_SECRET = Deno.env.get('AT_DELIVERY_WEBHOOK_SECRET') ?? '';

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function bodyParams(req: Request) {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return await req.json().catch(() => ({})) as Record<string, unknown>;
  }
  const form = await req.formData().catch(() => null);
  return form ? Object.fromEntries(form.entries()) : {};
}

function mapStatus(raw: string) {
  const status = raw.trim().toLowerCase();
  if (status === 'success' || status === 'delivered') return 'delivered';
  if (status === 'submitted') return 'submitted';
  if (status === 'buffered') return 'buffered';
  if (status === 'sent') return 'sent';
  if (status === 'rejected') return 'rejected';
  if (status === 'expired') return 'expired';
  if (status === 'failed') return 'failed';
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!WEBHOOK_SECRET || !safeEqual(token, WEBHOOK_SECRET)) return new Response('unauthorized', { status: 401 });

  const payload = await bodyParams(req);
  const providerMessageId = String(payload.id ?? payload.messageId ?? payload.message_id ?? '').trim();
  const providerStatus = String(payload.status ?? '').trim();
  const mapped = mapStatus(providerStatus);
  if (!providerMessageId || !providerStatus) return new Response('bad_request', { status: 400 });

  const admin = serviceClient();
  const { data: recipient } = await admin
    .from('bulk_sms_recipients')
    .select('id, campaign_id, status')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (!recipient) return new Response('not_found', { status: 404 });

  const update: Record<string, unknown> = { provider_status: providerStatus };
  const terminal = ['delivered', 'failed', 'rejected', 'expired'];
  const shouldAdvance = mapped && (
    !terminal.includes(recipient.status) || mapped === 'delivered'
  );
  if (shouldAdvance) update.status = mapped;
  if (mapped === 'delivered') update.delivered_at = new Date().toISOString();
  if (['failed', 'rejected', 'expired'].includes(mapped ?? '')) {
    update.error_message = String(payload.failureReason ?? payload.failure_reason ?? providerStatus).slice(0, 500);
  }
  const { error } = await admin.from('bulk_sms_recipients').update(update).eq('id', recipient.id);
  if (error) {
    console.error('[africastalking-sms-status] update failed', { code: error.code });
    return new Response('update_failed', { status: 500 });
  }
  const { error: refreshError } = await admin.rpc('refresh_bulk_sms_campaign', { _campaign_id: recipient.campaign_id });
  if (refreshError) {
    console.error('[africastalking-sms-status] campaign refresh failed', { code: refreshError.code });
    return new Response('refresh_failed', { status: 500 });
  }
  return new Response('ok', { status: 200 });
});
