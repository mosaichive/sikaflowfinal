// Sends a team invitation SMS containing the invite acceptance link.
// Never throws — returns { ok, reason? } so the UI can keep the invite row
// even when SMS delivery fails.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizePhone, sendAtSms } from '../_shared/at-sms.ts';
import { adminClient, logSms } from '../_shared/sms-log.ts';
import { consumeRateLimit } from '../_shared/rate-limit.ts';

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
    if (!/^[0-9a-f-]{36}$/i.test(inviteId)) return json({ ok: false, reason: 'invalid_invite' }, 400);

    const withinLimit = await consumeRateLimit({
      req,
      action: 'team_invite_sms',
      entity: `${callerId}|${inviteId}`,
      limit: 3,
      windowSeconds: 600,
    });
    if (!withinLimit) return json({ ok: false, reason: 'rate_limited' }, 429);

    const admin = adminClient();
    const { data: invite } = await admin
      .from('staff_invites')
      .select('id, business_owner_id, phone, token, status, expires_at')
      .eq('id', inviteId)
      .maybeSingle();
    if (!invite) return json({ ok: false, reason: 'invite_not_found' });
    if (invite.status !== 'pending' || new Date(invite.expires_at).getTime() <= Date.now()) {
      return json({ ok: false, reason: 'invite_unavailable' }, 409);
    }

    const phone = normalizePhone(String(invite.phone ?? ''));
    if (!/^\+\d{9,15}$/.test(phone)) return json({ ok: false, reason: 'no_valid_phone' }, 400);

    const ownerId = invite.business_owner_id as string;
    const { data: business } = await admin
      .from('businesses')
      .select('id, name, owner_user_id')
      .eq('owner_user_id', ownerId)
      .limit(1)
      .maybeSingle();
    if (!business) return json({ ok: false, reason: 'business_not_found' }, 404);

    if (callerId !== ownerId) {
      const { data: membership } = await admin
        .from('staff_members')
        .select('permissions')
        .eq('business_id', business.id)
        .eq('staff_user_id', callerId)
        .eq('active', true)
        .maybeSingle();
      const permissions = membership?.permissions as { role?: string; modules?: string[] } | null;
      const canManageTeam = permissions?.role === 'admin' || permissions?.role === 'owner' ||
        (Array.isArray(permissions?.modules) && permissions.modules.includes('staff'));
      if (!canManageTeam) return json({ ok: false, reason: 'forbidden' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('business_name, sms_notify_team_invite')
      .eq('user_id', ownerId)
      .maybeSingle();
    if (profile && profile.sms_notify_team_invite === false) {
      return json({ ok: false, reason: 'disabled' });
    }

    const businessName = profile?.business_name?.trim() || business.name?.trim() || 'KudiTrack';
    const publicUrl = (Deno.env.get('APP_PUBLIC_URL') || 'https://sikaflowsystem.vercel.app').replace(/\/+$/, '');
    const inviteUrl = `${publicUrl}/invite/${invite.token}`;
    const message = `You have been invited to join ${businessName} on KudiTrack. Use this link to accept your invitation: ${inviteUrl}`;

    try {
      const provider = await sendAtSms(phone, message);
      await logSms({
        business_id: business.id,
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
      console.error('[send-team-invite-sms] send failed', err instanceof Error ? err.name : 'unknown_error');
      await logSms({
        business_id: business.id,
        recipient_phone: phone,
        notification_type: 'team_invite',
        message,
        status: 'failed',
        error_message: errMsg,
        reference_id: invite.id,
      });
      return json({ ok: false, reason: 'send_failed' });
    }
  } catch (err) {
    console.error('[send-team-invite-sms] unexpected', err);
    return json({ ok: false, reason: 'unexpected_error' });
  }
});
