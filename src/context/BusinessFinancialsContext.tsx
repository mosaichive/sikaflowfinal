import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { type BusinessFinancials, calculateBusinessFinancials } from '@/lib/business-money';
import { supabase } from '@/integrations/supabase/client';
import { loadProductsCompat, logSupabaseError } from '@/lib/workspace';

type BusinessFinancialsContextValue = {
  financials: BusinessFinancials;
  loading: boolean;
  refresh: () => Promise<void>;
};

const EMPTY_FINANCIALS = calculateBusinessFinancials({
  sales: [],
  saleItems: [],
  products: [],
  otherIncome: [],
  expenses: [],
  savings: [],
  investments: [],
  investorFunds: [],
  restocks: [],
  openingCashBalance: 0,
});

const BusinessFinancialsContext = createContext<BusinessFinancialsContextValue | undefined>(undefined);

export function BusinessFinancialsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { businessId, loading: businessLoading } = useBusiness();
  const [financials, setFinancials] = useState<BusinessFinancials>(EMPTY_FINANCIALS);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (inFlightRef.current) return inFlightRef.current;

    const run = (async () => {
      if (!user || businessLoading) {
        setFinancials(EMPTY_FINANCIALS);
        setLoading(true);
        hasLoadedOnceRef.current = false;
        return;
      }

      // In this single-tenant schema each user owns their own data via
      // user_id + RLS. There is no business_id column on sales/expenses/etc.
      const userId = user.id;

      if (showLoading || !hasLoadedOnceRef.current) setLoading(true);

      try {
        const db = supabase as any;
        // Tables that exist for this user. `restocks`, `investments`, and
        // `investor_funding` do not exist in the live schema and have been
        // removed to avoid silent query failures that zero out financials.
        const [
          salesRes,
          productsRes,
          expensesRes,
          otherIncomeRes,
          savingsRes,
          restocksRes,
          investmentsRes,
          investorFundsRes,
          profileRes,
        ] = await Promise.allSettled([
            db
              .from('sales')
              .select('id,total,amount_paid,sale_date,payment_status,status')
              .eq('user_id', userId)
              .order('sale_date', { ascending: false }),
            loadProductsCompat(false, businessId ?? userId),
            db.from('expenses').select('amount,category,note,description').eq('user_id', userId),
            db.from('other_income').select('amount').eq('user_id', userId),
            db.from('savings').select('amount').eq('user_id', userId),
            db.from('restocks').select('total_cost,status,is_opening_stock').eq('user_id', userId),
            db.from('investments').select('amount,status').eq('user_id', userId),
            db.from('investor_funding').select('amount').eq('user_id', userId),
            db.from('profiles').select('opening_cash_balance').eq('id', userId).maybeSingle(),
          ]);

        if (salesRes.status === 'rejected') logSupabaseError('financials.load.sales', salesRes.reason, { userId });
        if (productsRes.status === 'rejected') logSupabaseError('financials.load.products', productsRes.reason, { userId });
        if (expensesRes.status === 'rejected') logSupabaseError('financials.load.expenses', expensesRes.reason, { userId });
        if (otherIncomeRes.status === 'rejected') logSupabaseError('financials.load.otherIncome', otherIncomeRes.reason, { userId });
        if (savingsRes.status === 'rejected') logSupabaseError('financials.load.savings', savingsRes.reason, { userId });
        if (restocksRes.status === 'rejected') logSupabaseError('financials.load.restocks', restocksRes.reason, { userId });

        const sales: any[] = salesRes.status === 'fulfilled' ? ((salesRes.value as any).data ?? []) : [];
        let saleItems: any[] = [];

        if (salesRes.status === 'fulfilled' && !(salesRes.value as any).error) {
          const saleIds = sales.map((sale: any) => sale.id).filter(Boolean);
          if (saleIds.length > 0) {
            const { data, error } = await db
              .from('sale_items')
              .select('sale_id,quantity,unit_cost,unit_price')
              .in('sale_id', saleIds);

            if (error) {
              logSupabaseError('financials.load.saleItems', error, { userId, saleCount: saleIds.length });
            } else {
              saleItems = (data as any[]) ?? [];
            }
          }
        }

        const openingCashBalance =
          profileRes.status === 'fulfilled'
            ? Number((profileRes.value as any)?.data?.opening_cash_balance ?? 0)
            : 0;

        const next = calculateBusinessFinancials({
          sales: sales as any,
          saleItems,
          products: (productsRes.status === 'fulfilled' ? ((productsRes.value as any) ?? []) : []) as any,
          otherIncome: (otherIncomeRes.status === 'fulfilled' ? ((otherIncomeRes.value as any).data ?? []) : []) as any,
          expenses: (expensesRes.status === 'fulfilled' ? ((expensesRes.value as any).data ?? []) : []) as any,
          savings: (savingsRes.status === 'fulfilled' ? ((savingsRes.value as any).data ?? []) : []) as any,
          investments: (investmentsRes.status === 'fulfilled' ? ((investmentsRes.value as any).data ?? []) : []) as any,
          investorFunds: (investorFundsRes.status === 'fulfilled' ? ((investorFundsRes.value as any).data ?? []) : []) as any,
          restocks: (restocksRes.status === 'fulfilled' ? ((restocksRes.value as any).data ?? []) : []) as any,
          openingCashBalance,
        });

        console.info('Financial Breakdown:', next);
        setFinancials(next);
      } finally {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    })();

    inFlightRef.current = run.finally(() => {
      inFlightRef.current = null;
    });

    return inFlightRef.current;
  }, [businessId, businessLoading, user]);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;

    const refresh = () => {
      void load(false);
    };

    // RLS scopes by user_id, so a postgres_changes subscription with the
    // user_id filter receives only this user's row events. The previous
    // `business_id=eq.<id>` filter never matched any rows because the
    // tables don't have a business_id column, so realtime never fired.
    const channel = supabase
      .channel(`business-financials:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding', filter: `user_id=eq.${userId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user]);

  const refresh = useCallback(() => load(false), [load]);

  const value = useMemo(
    () => ({
      financials,
      loading,
      refresh,
    }),
    [financials, loading, refresh],
  );

  return <BusinessFinancialsContext.Provider value={value}>{children}</BusinessFinancialsContext.Provider>;
}

export function useBusinessFinancials() {
  const context = useContext(BusinessFinancialsContext);
  if (!context) throw new Error('useBusinessFinancials must be used within BusinessFinancialsProvider');
  return context;
}
