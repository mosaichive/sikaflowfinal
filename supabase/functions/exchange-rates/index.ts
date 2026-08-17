// Global exchange rate service.
// - action "get": returns the cached rate for a pair, refreshing it when stale.
// - action "refresh": forces a refresh for the given base currency.
// Rates come from a public provider (no credentials shipped to the client).
import { adminClient } from '../_shared/sms-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROVIDER_NAME = 'open.er-api.com';
const PROVIDER_URL = (base: string) => `https://open.er-api.com/v6/latest/${base}`;
const TTL_HOURS = 6;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

async function fetchAndStore(base: string, targets: string[]) {
  const admin = adminClient();
  const res = await fetch(PROVIDER_URL(base));
  if (!res.ok) throw new Error(`provider_http_${res.status}`);
  const payload = await res.json();
  if (payload?.result !== 'success' || !payload?.rates) throw new Error('provider_bad_payload');

  const fetchedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString();
  const wanted = targets.length ? targets : Object.keys(payload.rates);

  const rows = wanted
    .filter((t) => typeof payload.rates[t] === 'number')
    .map((t) => ({
      base_currency: base,
      target_currency: t,
      rate: payload.rates[t],
      provider: PROVIDER_NAME,
      fetched_at: fetchedAt,
      expires_at: expiresAt,
      updated_at: fetchedAt,
    }));

  if (rows.length) {
    const { error } = await admin
      .from('exchange_rates')
      .upsert(rows, { onConflict: 'base_currency,target_currency' });
    if (error) throw new Error(error.message);
  }
  return { fetchedAt, count: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = String(body?.action ?? 'get');
    const base = normCode(body?.base) || 'GHS';
    const target = normCode(body?.target);
    const admin = adminClient();

    if (action === 'refresh') {
      // Refresh the full table for the base currency (used by Super Admin).
      const { data: currencies } = await admin.from('currencies').select('code');
      const codes = (currencies ?? []).map((c: any) => c.code);
      const result = await fetchAndStore(base, codes);
      return json({ ok: true, provider: PROVIDER_NAME, ...result });
    }

    if (!target) return json({ ok: false, reason: 'missing_target' }, 400);
    if (base === target) {
      return json({ ok: true, rate: 1, provider: PROVIDER_NAME, fetched_at: new Date().toISOString(), stale: false });
    }

    const { data: cached } = await admin
      .from('exchange_rates')
      .select('rate, provider, fetched_at, expires_at')
      .eq('base_currency', base)
      .eq('target_currency', target)
      .maybeSingle();

    const fresh = cached && new Date(cached.expires_at).getTime() > Date.now();
    if (fresh) {
      return json({ ok: true, rate: Number(cached.rate), provider: cached.provider, fetched_at: cached.fetched_at, stale: false });
    }

    try {
      const { data: currencies } = await admin.from('currencies').select('code');
      const codes = (currencies ?? []).map((c: any) => c.code);
      await fetchAndStore(base, codes.length ? codes : [target]);
      const { data: updated } = await admin
        .from('exchange_rates')
        .select('rate, provider, fetched_at')
        .eq('base_currency', base)
        .eq('target_currency', target)
        .maybeSingle();
      if (updated) {
        return json({ ok: true, rate: Number(updated.rate), provider: updated.provider, fetched_at: updated.fetched_at, stale: false });
      }
      return json({ ok: false, reason: 'rate_unavailable' }, 404);
    } catch (providerError) {
      console.error('[exchange-rates] provider failure', providerError);
      // Provider down: fall back to the last successfully retrieved rate.
      if (cached) {
        return json({
          ok: true,
          rate: Number(cached.rate),
          provider: cached.provider,
          fetched_at: cached.fetched_at,
          stale: true,
        });
      }
      return json({ ok: false, reason: 'provider_unavailable' }, 503);
    }
  } catch (error) {
    console.error('[exchange-rates] error', error);
    return json({ ok: false, reason: 'unexpected_error' }, 500);
  }
});
