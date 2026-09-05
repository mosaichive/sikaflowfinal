// Verify the SMS password-reset OTP and set a new password via admin API.
// On success returns a magic-link action URL that the client navigates to,
// which signs the user in so they can continue immediately.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizePhone, hashCode } from '../_shared/at-sms.ts';
import { consumeRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pw)) return 'Password must include an uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password must include a lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must include a number.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { phone: rawPhone, otp, new_password } = await req.json();
    const phone = normalizePhone(rawPhone);
    if (!phone || !otp || !new_password) return json({ error: 'Phone, code and new password required' }, 400);
    const pwErr = validatePassword(String(new_password));
    if (pwErr) return json({ error: pwErr }, 400);
    const withinLimit = await consumeRateLimit({
      req,
      action: 'password_reset_verify',
      entity: phone,
      limit: 8,
      windowSeconds: 600,
    });
    if (!withinLimit) return json({ error: 'Invalid or expired code.' }, 429);

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
      .eq('purpose', 'password_reset')
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
        .eq('purpose', 'password_reset')
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

    // Update password via admin
    const { error: updErr } = await admin.auth.admin.updateUserById(profile.id, {
      password: String(new_password),
    });
    if (updErr) {
      console.error('updateUserById failed', updErr);
      return json({ error: 'Could not update password.' }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error('[password-reset-verify-otp] error', err instanceof Error ? err.name : 'unknown_error');
    return json({ error: 'Could not reset the password.' }, 500);
  }
});
