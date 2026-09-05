// Claim a referral for the signed-in user. Rewards are applied only after a
// verified subscription payment by the payment functions.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'missing_auth' }, 401);

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({})) as {
      referral_token?: unknown;
      device_id?: unknown;
    };
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const rawToken = String(body?.referral_token ?? meta.referral_token ?? '').trim();
    const token = rawToken.toLowerCase();
    const deviceId = String(body.device_id ?? '').trim().slice(0, 128) || null;

    // Already attached?
    const { data: existing } = await admin
      .from('referrals')
      .select('id, status')
      .eq('referred_user_id', user.id)
      .maybeSingle();
    if (existing) {
      return json({ success: true, has_referral: true, claimed: false, status: existing.status });
    }

    if (!token) return json({ success: true, has_referral: false, claimed: false });
    if (!/^[a-z0-9]{8,64}$/.test(token)) {
      return json({ success: true, has_referral: false, claimed: false, reason: 'invalid_token' });
    }

    const { data: account } = await admin
      .from('referral_accounts')
      .select('id, business_id, owner_user_id, referral_code')
      .eq('referral_code', token)
      .maybeSingle();
    if (!account || account.owner_user_id === user.id) {
      return json({ success: true, has_referral: false, claimed: false, reason: 'invalid_token' });
    }

    const { error: insErr } = await admin.from('referrals').insert({
      referral_account_id: account.id,
      referral_code: account.referral_code,
      referrer_user_id: account.owner_user_id,
      referrer_business_id: account.business_id,
      referred_user_id: user.id,
      referred_email: user.email?.trim().toLowerCase() || null,
      referred_phone: user.phone || null,
      referred_device_id: deviceId,
      referred_signup_ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null,
      referred_user_agent: (req.headers.get('user-agent') || '').slice(0, 512) || null,
      status: 'pending',
    });
    if (insErr) {
      console.error('claim-referral insert failed', { code: insErr.code });
      return json({ error: 'could_not_claim_referral' }, 400);
    }

    await admin
      .from('profiles')
      .update({ referred_by_user_id: account.owner_user_id, referral_claimed_at: new Date().toISOString() })
      .eq('user_id', user.id);

    // Clear metadata token so we don't re-process.
    if (meta.referral_token) {
      const next = { ...meta };
      delete next.referral_token;
      await admin.auth.admin.updateUserById(user.id, { user_metadata: next });
    }

    return json({ success: true, has_referral: true, claimed: true, status: 'pending' });
  } catch (err) {
    console.error('claim-referral failed', err instanceof Error ? err.name : 'unknown_error');
    return json({ error: 'request_failed' }, 500);
  }
});
