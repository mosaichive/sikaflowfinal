// Send an SMS OTP to a phone for passwordless login.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendAtSms, normalizePhone, hashCode, SmsConfigError, SmsDeliveryError } from '../_shared/at-sms.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone: rawPhone } = await req.json().catch(() => ({}));
    const phone = normalizePhone(rawPhone);
    if (!phone || !/^\+\d{9,15}$/.test(phone)) {
      return json({ error: 'Please enter a valid phone number (e.g. 0244123456 or +233244123456).' }, 400);
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: profile } = await admin
      .from('profiles')
      .select('id, phone_verified')
      .eq('phone', phone)
      .maybeSingle();

    // Privacy: respond identically when the number isn't registered.
    if (!profile || !profile.phone_verified) {
      console.log('[phone-login-send-otp] unknown or unverified phone (returning success)', { phone });
      return json({ success: true });
    }

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('signup_otps')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('purpose', 'login')
      .gte('created_at', tenMinAgo);
    if ((count || 0) >= 3) {
      return json({ error: 'Too many code requests. Please wait 10 minutes before trying again.' }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(code);

    try {
      await sendAtSms(phone, `Your KudiTrack login code is ${code}. It expires in 10 minutes.`);
    } catch (err) {
      console.error('[phone-login-send-otp] sms failed', { phone, err });
      if (err instanceof SmsConfigError) {
        return json({ error: err.message, kind: 'config' }, 503);
      }
      if (err instanceof SmsDeliveryError) {
        return json({ error: err.message, kind: 'delivery' }, 502);
      }
      return json({ error: 'Could not send the verification code. Please try again.' }, 502);
    }

    await admin.from('signup_otps').insert({ phone, code_hash, user_id: profile.id, purpose: 'login' });
    return json({ success: true });
  } catch (err) {
    console.error('[phone-login-send-otp] internal error', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
