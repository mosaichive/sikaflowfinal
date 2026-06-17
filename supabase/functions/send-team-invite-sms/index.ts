// Sends a team invitation SMS containing the invite acceptance link.
// Never throws — returns { ok, reason? } so the UI can keep the invite row
// even when SMS delivery fails.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizePhone, sendAtSms } from '../_shared/at-sms.ts';
import { adminClient, logSms } from '../_shared/sms-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ ok: false, reason: 'unauthorized' }, 401);
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
    );
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) return json({ ok: false, reason: 'unauthorized' }, 401);
    const callerId = ures.user.id;

    const body = await req.json().catch(() => ({}));
    const inviteId = String(body?.invite_id ?? '').trim();
    const inviteUrl = String(body?.invite_url ?? '').trim();
    const rawPhone = String(body?.phone ?? '').trim();
    if (!inviteId || !inviteUrl || !rawPhone) {
      return json({ ok: false, reason: 'missing_fields' }, 400);
    }

    const phone = normalizePhone(rawPhone);
    if (!/^\+\d{9,15}$/.test(phone)) {
      return json({ ok: false, reason: 'invalid_phone' });
    }

    const admin = adminClient();
    const { data: invite } = await admin
      .from('staff_invites')
      .select('id, business_owner_id, email')
      .eq('id', inviteId)
      .maybeSingle();
    if (!invite) return json({ ok: false, reason: 'invite_not_found' });

    // Caller must be the owner OR an active staff member of that business
    const ownerId = invite.business_owner_id as string;
    if (callerId !== ownerId) {
      const { data: membership } = await admin
        .from('staff_members')
        .select('id')
        .eq('business_owner_id', ownerId)
        .eq('staff_user_id', callerId)
        .eq('active', true)
        .maybeSingle();
      if (!membership) return json({ ok: false, reason: 'forbidden' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('business_name, sms_notify_team_invite')
      .eq('id', ownerId)
      .maybeSingle();
    if (profile && profile.sms_notify_team_invite === false) {
      return json({ ok: false, reason: 'disabled' });
    }

    const businessName = profile?.business_name?.trim() || 'KudiTrack';
    const message = `You have been invited to join ${businessName} on KudiTrack. Use this link to accept your invitation: ${inviteUrl}`;

    try {
      const provider = await sendAtSms(phone, message);
      await logSms({
        business_id: ownerId,
        recipient_phone: phone,
        notification_type: 'team_invite',
        message,
        status: 'sent',
        provider_response: provider,
        reference_id: invite.id,
      });
      return json({ ok: true });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[send-team-invite-sms] send failed', errMsg);
      await logSms({
        business_id: ownerId,
        recipient_phone: phone,
        notification_type: 'team_invite',
        message,
        status: 'failed',
        error_message: errMsg,
        reference_id: invite.id,
      });
      return json({ ok: false, reason: 'send_failed', error: errMsg });
    }
  } catch (err) {
    console.error('[send-team-invite-sms] unexpected', err);
    return json({ ok: false, reason: 'unexpected_error' });
  }
});
