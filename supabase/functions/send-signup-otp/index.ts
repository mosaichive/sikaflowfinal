// Send a 6-digit SMS OTP via Africa's Talking for phone verification (logged-in user).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendAtSms, normalizePhone, hashCode, SmsConfigError, SmsDeliveryError } from '../_shared/at-sms.ts';

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
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Not authenticated' }, 401);

    const { phone: rawPhone } = await req.json().catch(() => ({}));
    const phone = normalizePhone(rawPhone);
    if (!phone || !/^\+\d{9,15}$/.test(phone)) {
      return json({ error: 'Please enter a valid phone number (e.g. 0244123456 or +233244123456).' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('signup_otps')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', tenMinAgo);
    if ((count || 0) >= 3) {
      return json({ error: 'Too many code requests. Please wait 10 minutes before trying again.' }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await hashCode(code);

    try {
      await sendAtSms(phone, `Your KudiTrack verification code is ${code}. It expires in 10 minutes.`);
    } catch (err) {
      console.error('[send-signup-otp] sms failed', { phone, userId: user.id, err });
      if (err instanceof SmsConfigError) {
        return json({ error: err.message, kind: 'config' }, 503);
      }
      if (err instanceof SmsDeliveryError) {
        return json({ error: err.message, kind: 'delivery' }, 502);
      }
      return json({ error: 'Could not send the verification code. Please try again.' }, 502);
    }

    await admin.from('signup_otps').insert({
      phone,
      code_hash,
      user_id: user.id,
      purpose: 'signup',
    });

    return json({ success: true, phone });
  } catch (err) {
    console.error('[send-signup-otp] internal error', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
