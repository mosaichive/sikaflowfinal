// Diagnostic-only: checks Africa's Talking credentials by hitting GET /user.
// Returns no secret material — only lengths, prefix/suffix fingerprints, and AT's response.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const username = (Deno.env.get('AT_USERNAME') ?? '').trim();
  const apiKey = (Deno.env.get('AT_API_KEY') ?? '').trim();
  const sender = (Deno.env.get('AT_SENDER_ID') ?? '').trim();
  const rawUser = Deno.env.get('AT_USERNAME') ?? '';
  const rawKey = Deno.env.get('AT_API_KEY') ?? '';

  const fp = {
    username,
    username_len: username.length,
    username_has_whitespace: rawUser !== username,
    apiKey_len: apiKey.length,
    apiKey_first4: apiKey.slice(0, 4),
    apiKey_last4: apiKey.slice(-4),
    apiKey_has_whitespace: rawKey !== apiKey,
    senderId: sender || '(none)',
  };

  const isSandbox = username === 'sandbox';
  const host = isSandbox ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const url = `https://${host}/version1/user?username=${encodeURIComponent(username)}`;

  let status = 0;
  let statusText = '';
  let body: unknown = null;
  try {
    const res = await fetch(url, { headers: { apiKey, Accept: 'application/json' } });
    status = res.status;
    statusText = res.statusText;
    const text = await res.text();
    try { body = JSON.parse(text); } catch { body = text; }
  } catch (err) {
    body = { network_error: String(err) };
  }

  return new Response(
    JSON.stringify({ host, fingerprint: fp, at_response: { status, statusText, body } }, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
