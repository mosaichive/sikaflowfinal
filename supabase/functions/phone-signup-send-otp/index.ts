// Send an SMS OTP for new-user phone signup (no auth required).
// Stores an OTP record with purpose='signup_new' and user_id=null.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendAtSms, normalizePhone, hashCode } from '../_shared/at-sms.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone: rawPhone } = await req.json();
    const phone = normalizePhone(rawPhone);
    if (!phone || phone.length < 9) return json({ error: 'Valid phone number required' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // If a verified profile already uses this phone, block signup.
    const { data: existing } = await admin
      .from('profiles')
      .select('id, phone_verified')
      .eq('phone', phone)
      .maybeSingle();
    if (existing && existing.phone_verified) {
      return json({ error: 'This phone number is already registered. Please sign in instead.' }, 409);
    }

    // Rate limit: max 3 in 10 min per phone for signup_new
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('signup_otps')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('purpose', 'signup_new')
      .gte('created_at', tenMinAgo);
    if ((count || 0) >= 3) return json({ error: 'Too many attempts. Wait 10 minutes.' }, 429);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(code);
    await admin.from('signup_otps').insert({
      phone,
      code_hash,
      purpose: 'signup_new',
    });

    await sendAtSms(phone, `Your KudiTrack signup code is ${code}. It expires in 10 minutes.`);
    return json({ success: true });
  } catch (err) {
    console.error('phone-signup-send-otp error:', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
