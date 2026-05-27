// Claim a referral for the signed-in (newly created) user.
// Reads the referral code from request body or the user's auth metadata,
// looks up the referrer via referral_codes, and inserts a pending referrals row.
// The annual subscription approval trigger handles rewarding later.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    const body = await req.json().catch(() => ({}));
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const rawToken = String(body?.referral_token ?? meta.referral_token ?? '').trim();
    const token = rawToken ? rawToken.toUpperCase() : '';

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

    const { data: codeRow } = await admin
      .from('referral_codes')
      .select('user_id')
      .eq('code', token)
      .maybeSingle();
    if (!codeRow || codeRow.user_id === user.id) {
      return json({ success: true, has_referral: false, claimed: false, reason: 'invalid_token' });
    }

    const { error: insErr } = await admin.from('referrals').insert({
      referrer_user_id: codeRow.user_id,
      referred_user_id: user.id,
      status: 'pending',
    });
    if (insErr) return json({ error: insErr.message }, 400);

    await admin.from('profiles').update({ referred_by_user_id: codeRow.user_id }).eq('id', user.id);

    // Clear metadata token so we don't re-process.
    if (meta.referral_token) {
      const next = { ...meta };
      delete next.referral_token;
      await admin.auth.admin.updateUserById(user.id, { user_metadata: next });
    }

    return json({ success: true, has_referral: true, claimed: true, status: 'pending' });
  } catch (err) {
    console.error('claim-referral error', err);
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
