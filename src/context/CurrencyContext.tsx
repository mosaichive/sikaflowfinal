import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import {
  CurrencyDef,
  DEFAULT_CURRENCY_CODE,
  FALLBACK_CURRENCIES,
  getActiveCurrency,
  getCurrency,
  getCurrencyRegistry,
  getCurrencySnapshot,
  setActiveCurrencyCode,
  setCurrencyRegistry,
  subscribeToCurrency,
} from '@/lib/currency';

interface CurrencyContextValue {
  code: string;
  currency: CurrencyDef;
  currencies: CurrencyDef[];
  activeCurrencies: CurrencyDef[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** Persists the business operating currency (owner/admin only, enforced by RLS). */
  setBusinessCurrency: (code: string) => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user, staffMembership } = useAuth();
  const [currencies, setCurrencies] = useState<CurrencyDef[]>(FALLBACK_CURRENCIES);
  const [loading, setLoading] = useState(true);

  const ownerUserId = staffMembership?.business_owner_id ?? user?.id ?? null;

  // Re-render whenever the active currency or registry changes.
  useSyncExternalStore(subscribeToCurrency, getCurrencySnapshot, getCurrencySnapshot);

  const loadCurrencies = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('currencies')
      .select('code, name, symbol, flag, country, decimals, active, is_default, sort_order')
      .order('sort_order', { ascending: true });
    if (error || !data?.length) return;
    setCurrencies(data as CurrencyDef[]);
    setCurrencyRegistry(data as CurrencyDef[]);
  }, []);

  const loadBusinessCurrency = useCallback(async () => {
    if (!ownerUserId) {
      setActiveCurrencyCode(DEFAULT_CURRENCY_CODE);
      return;
    }
    const { data } = await (supabase as any)
      .from('profiles')
      .select('currency')
      .eq('id', ownerUserId)
      .maybeSingle();
    setActiveCurrencyCode(data?.currency || DEFAULT_CURRENCY_CODE);
  }, [ownerUserId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadCurrencies(), loadBusinessCurrency()]);
    } finally {
      setLoading(false);
    }
  }, [loadCurrencies, loadBusinessCurrency]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setBusinessCurrency = useCallback(
    async (code: string) => {
      if (!user?.id) throw new Error('You must be signed in to change the business currency.');
      const { error } = await (supabase as any)
        .from('profiles')
        .update({ currency: code })
        .eq('id', user.id);
      if (error) throw error;
      setActiveCurrencyCode(code);
    },
    [user?.id],
  );

  const value = useMemo<CurrencyContextValue>(() => {
    const currency = getActiveCurrency();
    return {
      code: currency.code,
      currency,
      currencies: getCurrencyRegistry(),
      activeCurrencies: getCurrencyRegistry().filter((c) => c.active || c.code === currency.code),
      loading,
      refresh,
      setBusinessCurrency,
    };
    // getCurrencySnapshot() through useSyncExternalStore drives re-computation
  }, [loading, refresh, setBusinessCurrency, currencies, getCurrencySnapshot().version]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    // Public pages (store, tracking) may render outside the provider.
    const currency = getActiveCurrency();
    return {
      code: currency.code,
      currency,
      currencies: getCurrencyRegistry(),
      activeCurrencies: getCurrencyRegistry(),
      loading: false,
      refresh: async () => {},
      setBusinessCurrency: async () => {
        throw new Error('Currency provider unavailable');
      },
    } satisfies CurrencyContextValue;
  }
  return ctx;
}

export { getCurrency };
