// Server-side phone+password sign-in. Avoids disclosing the account email to
// unauthenticated callers (which would enable phone→email PII enumeration).
// The client posts { phone, password } and receives a Supabase session it can
// install via supabase.auth.setSession(). Returns a single generic error
// message regardless of whether the phone exists, is unverified, or the
// password is wrong — preventing account enumeration.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizePhone } from '../_shared/at-sms.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const GENERIC_ERROR = 'Invalid phone number or password.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body.phone);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!phone || !/^\+\d{9,15}$/.test(phone) || !password) {
      return json({ error: GENERIC_ERROR }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, phone_verified')
      .eq('phone', phone)
      .maybeSingle();

    if (!profile?.email || !profile.phone_verified) {
      return json({ error: GENERIC_ERROR }, 400);
    }

    const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: session, error } = await anon.auth.signInWithPassword({
      email: profile.email,
      password,
    });
    if (error || !session?.session) {
      return json({ error: GENERIC_ERROR }, 400);
    }

    return json({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    });
  } catch (err) {
    console.error('[resolve-phone-login] error', err);
    return json({ error: GENERIC_ERROR }, 400);
  }
});
