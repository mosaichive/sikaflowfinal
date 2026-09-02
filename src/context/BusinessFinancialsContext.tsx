import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { type BusinessFinancials, calculateBusinessFinancials } from '@/lib/business-money';
import { supabase } from '@/integrations/supabase/client';
import {
  isMissingColumnError,
  loadProductsCompat,
  loadRowsForBusinessCompat,
  logSupabaseError,
} from '@/lib/workspace';

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

function isMissingProfileColumnError(error: unknown, column: string) {
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();
  const details = String((error as { details?: string } | null)?.details || '').toLowerCase();
  const target = column.toLowerCase();
  return (
    (message.includes(target) && (message.includes('schema cache') || message.includes('column'))) ||
    (details.includes(target) && (details.includes('schema cache') || details.includes('column')))
  );
}

function profileIdentityFilter(userId: string) {
  return `id.eq.${userId},user_id.eq.${userId}`;
}

async function loadSaleItemsForSales(
  db: any,
  saleIds: string[],
  context: Record<string, unknown>,
) {
  let result = await db
    .from('sale_items')
    .select('sale_id,quantity,cost_price,unit_price')
    .in('sale_id', saleIds);

  if (result.error && isMissingColumnError(result.error, 'cost_price', 'sale_items')) {
    result = await db
      .from('sale_items')
      .select('sale_id,quantity,unit_cost,unit_price')
      .in('sale_id', saleIds);
  }

  if (result.error) {
    logSupabaseError('financials.load.saleItems', result.error, context);
    return [];
  }

  return (result.data as any[]) ?? [];
}

export function BusinessFinancialsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { businessId, loading: businessLoading } = useBusiness();
  const [financials, setFinancials] = useState<BusinessFinancials>(EMPTY_FINANCIALS);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const loadSeqRef = useRef(0);

  const load = useCallback(async (showLoading = false) => {
    const loadSeq = ++loadSeqRef.current;
    if (!user || businessLoading) {
      setFinancials(EMPTY_FINANCIALS);
      setLoading(true);
      hasLoadedOnceRef.current = false;
      return;
    }

    if (!businessId) {
      setFinancials(EMPTY_FINANCIALS);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      return;
    }

    const ownerId = businessId;

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
        loadRowsForBusinessCompat({
          table: 'sales',
          select: 'id,total,amount_paid,sale_date,payment_status,status,stock_status,sale_channel',
          businessId,
          ownerId,
          order: { column: 'sale_date', ascending: false },
          context: 'financials.load.sales',
        }),
        loadProductsCompat(false, businessId ?? ownerId),
        loadRowsForBusinessCompat({
          table: 'expenses',
          select: 'amount,category,description',
          businessId,
          ownerId,
          context: 'financials.load.expenses',
        }),
        loadRowsForBusinessCompat({
          table: 'other_income',
          select: 'amount',
          businessId,
          ownerId,
          context: 'financials.load.otherIncome',
        }),
        loadRowsForBusinessCompat({
          table: 'savings',
          select: 'amount',
          businessId,
          ownerId,
          context: 'financials.load.savings',
        }),
        loadRowsForBusinessCompat({
          table: 'restocks',
          select: 'total_cost,status,is_opening_stock',
          businessId,
          ownerId,
          context: 'financials.load.restocks',
        }),
        loadRowsForBusinessCompat({
          table: 'investments',
          select: 'amount,status',
          businessId,
          ownerId,
          context: 'financials.load.investments',
        }),
        loadRowsForBusinessCompat({
          table: 'investor_funding',
          select: 'amount',
          businessId,
          ownerId,
          context: 'financials.load.investorFunds',
        }),
        db
          .from('profiles')
          .select('opening_cash_balance')
          .or(profileIdentityFilter(ownerId))
          .limit(1)
          .maybeSingle(),
      ]);

      let profileValue = profileRes.status === 'fulfilled' ? profileRes.value as any : null;
      if (
        profileValue?.error
        && isMissingProfileColumnError(profileValue.error, 'user_id')
      ) {
        profileValue = await db
          .from('profiles')
          .select('opening_cash_balance')
          .eq('id', ownerId)
          .maybeSingle();
      }

      if (salesRes.status === 'rejected') logSupabaseError('financials.load.sales', salesRes.reason, { ownerId, businessId });
      if (productsRes.status === 'rejected') logSupabaseError('financials.load.products', productsRes.reason, { ownerId, businessId });
      if (expensesRes.status === 'rejected') logSupabaseError('financials.load.expenses', expensesRes.reason, { ownerId, businessId });
      if (otherIncomeRes.status === 'rejected') logSupabaseError('financials.load.otherIncome', otherIncomeRes.reason, { ownerId, businessId });
      if (savingsRes.status === 'rejected') logSupabaseError('financials.load.savings', savingsRes.reason, { ownerId, businessId });
      if (restocksRes.status === 'rejected') logSupabaseError('financials.load.restocks', restocksRes.reason, { ownerId, businessId });

      const sales: any[] = salesRes.status === 'fulfilled' ? ((salesRes.value as any) ?? []) : [];
      let saleItems: any[] = [];

      if (salesRes.status === 'fulfilled') {
        const saleIds = sales.map((sale: any) => sale.id).filter(Boolean);
        if (saleIds.length > 0) {
          saleItems = await loadSaleItemsForSales(db, saleIds, { ownerId, businessId, saleCount: saleIds.length });
        }
      }

      const openingCashBalance =
        Number(profileValue?.data?.opening_cash_balance ?? 0);

      const next = calculateBusinessFinancials({
        sales: sales as any,
        saleItems,
        products: (productsRes.status === 'fulfilled' ? ((productsRes.value as any) ?? []) : []) as any,
        otherIncome: (otherIncomeRes.status === 'fulfilled' ? ((otherIncomeRes.value as any) ?? []) : []) as any,
        expenses: (expensesRes.status === 'fulfilled' ? ((expensesRes.value as any) ?? []) : []) as any,
        savings: (savingsRes.status === 'fulfilled' ? ((savingsRes.value as any) ?? []) : []) as any,
        investments: (investmentsRes.status === 'fulfilled' ? ((investmentsRes.value as any) ?? []) : []) as any,
        investorFunds: (investorFundsRes.status === 'fulfilled' ? ((investorFundsRes.value as any) ?? []) : []) as any,
        restocks: (restocksRes.status === 'fulfilled' ? ((restocksRes.value as any) ?? []) : []) as any,
        openingCashBalance,
      });

      if (loadSeq !== loadSeqRef.current) return;

      console.info('Financial Breakdown:', next);
      setFinancials(next);
    } finally {
      if (loadSeq === loadSeqRef.current) {
        setLoading(false);
        hasLoadedOnceRef.current = true;
      }
    }
  }, [businessId, businessLoading, user]);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    void load(true);
  }, [load]);

  useEffect(() => {
    if (!user || businessLoading || !businessId) return;
    const ownerId = businessId;
    const tableFilter = `business_id=eq.${businessId}`;

    const refresh = () => {
      void load(false);
    };

    const channel = supabase
      .channel(`business-financials:${ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding', filter: tableFilter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${ownerId}` }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, businessLoading, load, user]);

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
