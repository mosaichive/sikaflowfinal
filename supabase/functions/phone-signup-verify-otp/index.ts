// Verify SMS OTP for new-user phone signup, then create the auth user.
// Returns a magic-link action_link the client can navigate to in order to start the session.
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
    const body = await req.json();
    const phone = normalizePhone(body.phone);
    const otp = String(body.otp || '').trim();
    const password = String(body.password || '');
    const fullName = String(body.full_name || '').trim();
    const emailInput = String(body.email || '').trim().toLowerCase();
    const referralToken = body.referral_token ? String(body.referral_token) : null;
    const signupDeviceId = body.signup_device_id ? String(body.signup_device_id) : null;
    const redirectTo = body.redirect_to ? String(body.redirect_to) : undefined;

    if (!phone || !otp) return json({ error: 'Phone and code required' }, 400);
    if (!fullName) return json({ error: 'Full name required' }, 400);
    if (!password || password.length < 6) return json({ error: 'Password must be at least 6 characters' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Re-check phone not already verified to another account
    const { data: existing } = await admin
      .from('profiles')
      .select('id, phone_verified')
      .eq('phone', phone)
      .maybeSingle();
    if (existing && existing.phone_verified) {
      return json({ error: 'This phone number is already registered.' }, 409);
    }

    // Validate OTP
    const code_hash = await hashCode(otp);
    const { data: rec } = await admin
      .from('signup_otps')
      .select('*')
      .eq('phone', phone)
      .eq('purpose', 'signup_new')
      .eq('code_hash', code_hash)
      .eq('consumed', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!rec) {
      const { data: latest } = await admin
        .from('signup_otps')
        .select('id, attempts')
        .eq('phone', phone)
        .eq('purpose', 'signup_new')
        .eq('consumed', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest) {
        const next = (latest.attempts || 0) + 1;
        await admin.from('signup_otps').update({ attempts: next, consumed: next >= 5 }).eq('id', latest.id);
      }
      return json({ error: 'Invalid or expired code.' }, 400);
    }

    // Pick an email for the auth account. Use the optional one if provided; otherwise synthesize.
    const phoneDigits = phone.replace(/\D/g, '');
    const authEmail = emailInput && /.+@.+\..+/.test(emailInput)
      ? emailInput
      : `phone+${phoneDigits}@phone.kuditrack.local`;

    // If the chosen email is already in use, fail clearly.
    const { data: emailProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', authEmail)
      .maybeSingle();
    if (emailProfile) {
      return json({ error: 'An account with this email already exists. Please sign in.' }, 409);
    }

    // Create the auth user (email pre-confirmed since we just verified the phone).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: fullName,
        full_name: fullName,
        phone,
        referral_token: referralToken || undefined,
        signup_device_id: signupDeviceId || undefined,
      },
    });
    if (createErr || !created?.user) {
      console.error('createUser failed', createErr);
      return json({ error: createErr?.message || 'Could not create account.' }, 500);
    }

    // Stamp the verified phone on the profile.
    await admin
      .from('profiles')
      .update({
        phone,
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
        last_verified_phone: phone,
        display_name: fullName,
      })
      .eq('id', created.user.id);

    await admin.from('signup_otps').update({ consumed: true, user_id: created.user.id }).eq('id', rec.id);

    // Issue a magic link so the client can start a session without re-entering the password.
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: { redirectTo: redirectTo || undefined },
    });
    if (linkErr || !link?.properties?.action_link) {
      console.error('generateLink failed', linkErr);
      // Account was created; the client can still sign in with email+password.
      return json({ success: true, action_link: null });
    }

    return json({ success: true, action_link: link.properties.action_link });
  } catch (err) {
    console.error('phone-signup-verify-otp error:', err);
    return json({ error: (err as Error).message || 'Internal error' }, 500);
  }
});
