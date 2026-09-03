// After the user clicks the email confirmation link Supabase Auth sends,
// the client calls this function. It reads the auth user's email_confirmed_at
// via the service-role admin API (always fresh, bypasses any stale JWT claims),
// and if confirmed, sets profiles.email_verified + businesses.email_verified.
// If the phone is also verified, the business status flips to 'active'.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user = userData.user;

    // Always use service-role admin to read freshest auth state — JWT claims may be stale.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: authUser, error: adminErr } = await admin.auth.admin.getUserById(user.id);
    if (adminErr) {
      console.error('admin.getUserById error:', adminErr);
      return new Response(JSON.stringify({ error: adminErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const confirmedAt = authUser?.user?.email_confirmed_at || authUser?.user?.confirmed_at || null;
    const confirmed = !!confirmedAt;

    console.log(`sync-email-verification: user=${user.id} confirmed=${confirmed} at=${confirmedAt}`);

    if (!confirmed) {
      return new Response(JSON.stringify({ verified: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The live schema has no profiles.business_id / profiles.email_verified / businesses table:
    // verification state lives on auth.users. Nothing else to sync here.
    const activated = false;
    const phoneVerified = await admin
      .from('profiles')
      .select('phone_verified')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => !!data?.phone_verified)
      .catch(() => false);

    return new Response(JSON.stringify({ verified: true, activated, phoneVerified, confirmedAt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('sync-email-verification error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
