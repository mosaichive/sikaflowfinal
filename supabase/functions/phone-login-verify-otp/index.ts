// Verify the SMS login OTP and return a magic-link action URL the client can navigate to,
// which signs the user in via their email-backed auth account.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizePhone, hashCode } from '../_shared/at-sms.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone: rawPhone, otp, redirect_to } = await req.json();
    const phone = normalizePhone(rawPhone);
    if (!phone || !otp) return json({ error: 'Phone and code required' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, phone_verified')
      .eq('phone', phone)
      .maybeSingle();
    if (!profile || !profile.phone_verified || !profile.email) {
      return json({ error: 'Invalid code.' }, 400);
    }

    const code_hash = await hashCode(String(otp));
    const { data: rec } = await admin
      .from('signup_otps')
      .select('*')
      .eq('phone', phone)
      .eq('user_id', profile.id)
      .eq('code_hash', code_hash)
      .eq('consumed', false)
      .eq('purpose', 'login')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rec) {
      const { data: latest } = await admin
        .from('signup_otps')
        .select('id, attempts')
        .eq('phone', phone)
        .eq('user_id', profile.id)
        .eq('consumed', false)
        .eq('purpose', 'login')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) {
        const next = (latest.attempts || 0) + 1;
        await admin.from('signup_otps').update({ attempts: next, consumed: next >= 5 }).eq('id', latest.id);
      }
      return json({ error: 'Invalid or expired code.' }, 400);
    }

    await admin.from('signup_otps').update({ consumed: true }).eq('id', rec.id);

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
      options: { redirectTo: redirect_to || undefined },
    });
    if (linkErr || !link?.properties?.action_link) {
      console.error('generateLink failed', linkErr);
      return json({ error: 'Could not start login session.' }, 500);
    }

    return json({ success: true, action_link: link.properties.action_link });
  } catch (err) {
    console.error('phone-login-verify-otp error:', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
