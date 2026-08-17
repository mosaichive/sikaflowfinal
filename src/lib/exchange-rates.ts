import { supabase } from '@/integrations/supabase/client';

export type RateResult = {
  ok: boolean;
  rate: number | null;
  provider: string | null;
  fetchedAt: string | null;
  /** True when the provider was unreachable and a cached rate is being shown. */
  stale: boolean;
  reason?: string;
};

export async function fetchExchangeRate(base: string, target: string): Promise<RateResult> {
  if (!base || !target) return { ok: false, rate: null, provider: null, fetchedAt: null, stale: false, reason: 'missing_currency' };
  if (base === target) return { ok: true, rate: 1, provider: null, fetchedAt: new Date().toISOString(), stale: false };

  const { data, error } = await supabase.functions.invoke('exchange-rates', {
    body: { action: 'get', base, target },
  });

  if (error || !data?.ok) {
    return { ok: false, rate: null, provider: null, fetchedAt: null, stale: false, reason: data?.reason ?? error?.message };
  }

  return {
    ok: true,
    rate: Number(data.rate),
    provider: data.provider ?? null,
    fetchedAt: data.fetched_at ?? null,
    stale: Boolean(data.stale),
  };
}

export async function refreshExchangeRates(base: string) {
  const { data, error } = await supabase.functions.invoke('exchange-rates', {
    body: { action: 'refresh', base },
  });
  if (error || !data?.ok) throw new Error(data?.reason ?? error?.message ?? 'Could not refresh exchange rates.');
  return data as { count: number; fetchedAt: string; provider: string };
}
