// Resolve a verified phone number to its account email so the client can sign
// in with email + password. Returns 404 if no account, 403 if phone exists but
// is not verified, 200 with { email } if verified.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizePhone } from '../_shared/at-sms.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body.phone);
    if (!phone || !/^\+\d{9,15}$/.test(phone)) {
      return json({ error: 'Enter a valid phone number.' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, phone_verified')
      .eq('phone', phone)
      .maybeSingle();

    if (!profile || !profile.email) {
      return json({ error: 'No account is registered with this phone number.' }, 404);
    }
    if (!profile.phone_verified) {
      return json({ error: 'This phone number has not been verified.' }, 403);
    }
    return json({ email: profile.email });
  } catch (err) {
    console.error('[resolve-phone-login] error', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
