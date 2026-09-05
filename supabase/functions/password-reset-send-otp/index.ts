// Send a 6-digit SMS OTP for phone-based password reset.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendAtSms, normalizePhone, hashCode, SmsConfigError, SmsDeliveryError } from '../_shared/at-sms.ts';
import { consumeRateLimit, redactPhone } from '../_shared/rate-limit.ts';

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

    const withinLimit = await consumeRateLimit({
      req,
      action: 'password_reset_send',
      entity: phone,
      limit: 3,
      windowSeconds: 600,
    });
    if (!withinLimit) return json({ error: 'Too many code requests. Please wait 10 minutes before trying again.' }, 429);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: profile } = await admin
      .from('profiles')
      .select('id, phone_verified')
      .eq('phone', phone)
      .maybeSingle();

    if (!profile || !profile.phone_verified) {
      console.log('[password-reset-send-otp] generic response for unavailable phone', { phone: redactPhone(phone) });
      return json({ success: true });
    }

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('signup_otps')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('purpose', 'password_reset')
      .gte('created_at', tenMinAgo);
    if ((count || 0) >= 3) {
      return json({ error: 'Too many code requests. Please wait 10 minutes before trying again.' }, 429);
    }

    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    const code = String(100000 + (random % 900000));
    const code_hash = await hashCode(code);

    try {
      await sendAtSms(phone, `Your KudiTrack password reset code is ${code}. It expires in 10 minutes.`);
    } catch (err) {
      console.error('[password-reset-send-otp] sms failed', { phone: redactPhone(phone), kind: err instanceof Error ? err.name : 'unknown_error' });
      if (err instanceof SmsConfigError) return json({ error: err.message, kind: 'config' }, 503);
      if (err instanceof SmsDeliveryError) return json({ error: err.message, kind: 'delivery' }, 502);
      return json({ error: 'Could not send the verification code. Please try again.' }, 502);
    }

    await admin.from('signup_otps').insert({
      phone,
      code_hash,
      user_id: profile.id,
      purpose: 'password_reset',
    });

    return json({ success: true });
  } catch (err) {
    console.error('[password-reset-send-otp] internal error', err instanceof Error ? err.name : 'unknown_error');
    return json({ error: 'Could not process the reset request.' }, 500);
  }
});
