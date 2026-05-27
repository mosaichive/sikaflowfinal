// Verify the SMS OTP sent by send-signup-otp.
// On success: sets profiles.phone_verified = true (and stores phone if not yet set).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizePhone, hashCode } from '../_shared/at-sms.ts';

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

    const { phone: rawPhone, otp } = await req.json();
    const phone = normalizePhone(rawPhone);
    if (!phone || !otp) return json({ error: 'Phone and OTP required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const code_hash = await hashCode(String(otp));

    const { data: rec } = await admin
      .from('signup_otps')
      .select('*')
      .eq('phone', phone)
      .eq('user_id', user.id)
      .eq('code_hash', code_hash)
      .eq('consumed', false)
      .eq('purpose', 'signup')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rec) {
      // bump attempts on latest unused
      const { data: latest } = await admin
        .from('signup_otps')
        .select('id, attempts')
        .eq('phone', phone)
        .eq('user_id', user.id)
        .eq('consumed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) {
        const next = (latest.attempts || 0) + 1;
        await admin.from('signup_otps').update({ attempts: next, consumed: next >= 5 }).eq('id', latest.id);
        if (next >= 5) return json({ error: 'Too many attempts. Request a new code.' }, 429);
      }
      return json({ error: 'Invalid or expired code.' }, 400);
    }

    await admin.from('signup_otps').update({ consumed: true }).eq('id', rec.id);
    await admin.from('profiles').update({ phone_verified: true, phone }).eq('id', user.id);

    return json({ success: true });
  } catch (err) {
    console.error('verify-signup-otp error:', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
