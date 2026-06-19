import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  HandCoins,
  Package,
  Plus,
  Receipt,
  ShoppingCart,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AnimatedNumber } from '@/components/AnimatedNumber';

import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { FirstTimeSetupDialog } from '@/components/FirstTimeSetupDialog';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/constants';
import { sumTodaySales, toNumber } from '@/lib/sales-inventory';
import { calculateBusinessFinancials } from '@/lib/business-money';
import { cn } from '@/lib/utils';
import { loadProductsCompat, logSupabaseError } from '@/lib/workspace';
import { useBusinessFinancials } from '@/context/BusinessFinancialsContext';

type SaleRow = {
  id: string;
  sale_date: string;
  total: number | string;
  amount_paid: number | string;
  payment_status: string;
  status?: string | null;
  stock_status?: string | null;
  customer_name?: string | null;
  reference?: string | null;
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_name: string;
  quantity: number;
  unit_price: number | string;
  cost_price: number | string;
  line_total: number | string;
};

type ProductRow = {
  id: string;
  name: string;
  category?: string | null;
  quantity: number | null;
  selling_price: number | string | null;
  cost_price?: number | string | null;
  low_stock_threshold?: number | null;
  reorder_level?: number | null;
  image_url?: string | null;
  is_archived?: boolean | null;
};

type ExpenseRow = {
  id: string;
  amount: number | string;
  description?: string | null;
  category?: string | null;
  expense_date: string;
};

type OtherIncomeRow = {
  id: string;
  amount: number | string;
  category: string;
  description?: string | null;
  income_date: string;
};

type SavingsRow = {
  id: string;
  amount: number | string;
  savings_date: string;
  source?: string | null;
  note?: string | null;
  reference?: string | null;
};
type InvestmentRow = { amount: number | string; investment_date: string };
type FundingRow = { amount: number | string; date_received: string; investor_name?: string | null; reference?: string | null };
type RestockRow = { total_cost: number | string; status?: string | null; restock_date?: string | null };

type DashboardData = {
  sales: SaleRow[];
  saleItems: SaleItemRow[];
  products: ProductRow[];
  expenses: ExpenseRow[];
  otherIncome: OtherIncomeRow[];
  savings: SavingsRow[];
  investments: InvestmentRow[];
  investorFunds: FundingRow[];
  restocks: RestockRow[];
};

function startOfYear(year: number) {
  return `${year}-01-01`;
}

function endOfYear(year: number) {
  return `${year}-12-31`;
}

function startOfMonth(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function endOfMonth(year: number, month: number) {
  const date = new Date(Date.UTC(year, month + 1, 0));
  return date.toISOString().slice(0, 10);
}

function inRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(`${from}T00:00:00`).getTime() && time <= new Date(`${to}T23:59:59`).getTime();
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function computeTrend(current: number, previous: number): { value: number; label: string; direction: 'up' | 'down' | 'flat' } {
  if (!previous && !current) return { value: 0, label: 'vs prior period', direction: 'flat' };
  if (!previous) return { value: 100, label: 'vs prior period', direction: 'up' };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.05) return { value: 0, label: 'vs prior period', direction: 'flat' };
  return { value: pct, label: 'vs prior period', direction: pct > 0 ? 'up' : 'down' };
}

function getOnboardingCompletionKey(userId: string) {
  return `sikaflow_onboarding_complete_${userId}`;
}

type AnalyticsMetric = 'sales' | 'profit' | 'expenses';

type AnalyticsPoint = {
  label: string;
  monthIndex: number;
  sales: number;
  profit: number;
  expenses: number;
};

function buildYearlyAnalyticsData(data: DashboardData, year: number): AnalyticsPoint[] {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const from = startOfMonth(year, monthIndex);
    const to = endOfMonth(year, monthIndex);
    const sales = data.sales.filter((row) => inRange(row.sale_date, from, to));
    const saleIds = new Set(sales.map((row) => row.id));
    const financials = calculateBusinessFinancials({
      sales: sales as any,
      saleItems: data.saleItems.filter((item) => saleIds.has(item.sale_id)) as any,
      products: data.products as any,
      otherIncome: data.otherIncome.filter((row) => inRange(row.income_date, from, to)) as any,
      expenses: data.expenses.filter((row) => inRange(row.expense_date, from, to)) as any,
      savings: data.savings.filter((row) => inRange(row.savings_date, from, to)) as any,
      investments: data.investments.filter((row) => inRange(row.investment_date, from, to)) as any,
      investorFunds: data.investorFunds.filter((row) => inRange(row.date_received, from, to)) as any,
      restocks: data.restocks.filter((row) => inRange(row.restock_date, from, to)) as any,
      openingCashBalance: 0,
    });

    return {
      label: new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-GH', { month: 'short' }),
      monthIndex,
      sales: financials.paidSalesRevenue,
      profit: financials.profit,
      expenses: financials.expenses,
    };
  });
}

function getMetricLabel(metric: AnalyticsMetric) {
  if (metric === 'profit') return 'Profit';
  if (metric === 'expenses') return 'Expenses';
  return 'Sales';
}

function buildAnalyticsSummary(data: AnalyticsPoint[], metric: AnalyticsMetric, year: number) {
  const values = data.map((row) => ({ row, value: row[metric] }));
  const total = values.reduce((sum, entry) => sum + entry.value, 0);
  const nonZero = values.filter((entry) => entry.value > 0);
  const pool = nonZero.length > 0 ? nonZero : values;
  const highest = pool.reduce((best, entry) => (entry.value > best.value ? entry : best), pool[0]);
  const lowest = pool.reduce((best, entry) => (entry.value < best.value ? entry : best), pool[0]);
  const label = getMetricLabel(metric);
  const monthName = (entry: { row: AnalyticsPoint; value: number } | undefined) =>
    entry
      ? new Date(year, entry.row.monthIndex, 1).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' })
      : '—';

  return {
    total,
    average: total / 12,
    totalLabel: `Total ${label}`,
    averageLabel: `Average Monthly ${label}`,
    highest: highest ? `${monthName(highest)} (${formatCurrency(highest.value)})` : '—',
    lowest: lowest ? `${monthName(lowest)} (${formatCurrency(lowest.value)})` : '—',
  };
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const values = data.length > 1 ? data : [0, 0];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
      const y = 28 - ((value - min) / range) * 22 - 3;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-9 w-full overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TrendLine({
  trend,
  positiveOnDown = false,
}: {
  trend: { value: number; label: string; direction: 'up' | 'down' | 'flat' };
  positiveOnDown?: boolean;
}) {
  const direction = trend.direction;
  const positive = direction === 'flat' ? null : positiveOnDown ? direction === 'down' : direction === 'up';
  const Icon = direction === 'down' ? ArrowDownRight : ArrowUpRight;
  const signedValue = direction === 'flat' ? '0.0%' : `${Math.abs(trend.value).toFixed(1)}%`;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={cn(
        'inline-flex items-center gap-1 font-semibold',
        positive === true && 'text-emerald-600 dark:text-[#2df47e]',
        positive === false && 'text-rose-600 dark:text-[#ff4f67]',
        positive === null && 'text-slate-500 dark:text-slate-400',
      )}>
        {direction !== 'flat' ? <Icon className="h-3.5 w-3.5" /> : null}
        {signedValue}
      </span>
      <span className="text-slate-500 dark:text-slate-400">{trend.label}</span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  trend,
  index = 0,
  isCurrency = true,
  iconClassName,
  glowClassName,
  sparklineColor,
  sparklineData,
  positiveOnDown = false,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  trend: { value: number; label: string; direction: 'up' | 'down' | 'flat' };
  index?: number;
  isCurrency?: boolean;
  iconClassName: string;
  glowClassName: string;
  sparklineColor: string;
  sparklineData: number[];
  positiveOnDown?: boolean;
}) {
  const formattedValue = isCurrency ? formatCurrency(value) : String(value);
  const valueSizeClass = isCurrency && formattedValue.length >= 13
    ? 'text-[clamp(1rem,1.12vw,1.15rem)]'
    : 'text-[clamp(1.25rem,1.6vw,1.5rem)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      whileHover={{ y: -3 }}
      className="group relative min-h-[196px] overflow-hidden rounded-[14px] border border-border bg-card p-5"
    >

      <div className="relative flex h-full flex-col">
        <div className="flex items-start gap-4">
          <span className={cn('flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full ring-1 ring-black/5 dark:ring-white/10', iconClassName)}>
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1 pt-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{title}</p>
            <p className={cn('mt-3 whitespace-nowrap font-bold tracking-tight text-slate-950 tabular-nums dark:text-white', valueSizeClass)}>
              {isCurrency ? <AnimatedNumber value={value} formatter={(n) => formatCurrency(n)} /> : <AnimatedNumber value={value} />}
            </p>
          </div>
        </div>
        <div className="mt-6">
          <TrendLine trend={trend} positiveOnDown={positiveOnDown} />
        </div>
        <div className="mt-auto pt-5">
          <Sparkline data={sparklineData} color={sparklineColor} />
        </div>
      </div>
    </motion.div>
  );
}

function MiniMetric({
  title,
  value,
  icon: Icon,
  helper,
  iconClassName,
  valueClassName,
  index = 0,
  isCurrency = false,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  helper?: string;
  iconClassName: string;
  valueClassName?: string;
  index?: number;
  isCurrency?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.18 + index * 0.04 }}
      whileHover={{ y: -2 }}
      className="relative min-h-[116px] overflow-hidden rounded-[14px] border border-border bg-card p-5"
    >
      <div className="flex h-full items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{title}</p>
          <p className={cn('mt-3 whitespace-nowrap text-[clamp(1.35rem,1.7vw,1.5rem)] font-bold tracking-tight text-slate-950 tabular-nums dark:text-white', valueClassName)}>
            {typeof value === 'number'
              ? (isCurrency
                  ? <AnimatedNumber value={value} formatter={(n) => formatCurrency(n)} />
                  : <AnimatedNumber value={value} />)
              : value}
          </p>
          {helper ? <p className="mt-3 truncate text-sm text-slate-500 dark:text-slate-400">{helper}</p> : null}
        </div>
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-black/5 dark:ring-white/10', iconClassName)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </motion.div>
  );
}

function AnalyticsChart({
  data,
  dataKey,
  gradientId,
  stroke,
  stop1,
  stop2,
  stop1Opacity = 0.55,
  stop2Opacity = 0.04,
  activeDotStroke,
  emptyText,
  year,
}: {
  data: AnalyticsPoint[];
  dataKey: AnalyticsMetric;
  gradientId: string;
  stroke: string;
  stop1: string;
  stop2: string;
  stop1Opacity?: number;
  stop2Opacity?: number;
  activeDotStroke?: string;
  emptyText: string;
  year: number;
}) {
  const hasData = data.some((row) => (row[dataKey] as number) > 0);
  if (!hasData) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500 dark:border-[#223044] dark:bg-[#090f18] dark:text-slate-400">
        {emptyText}
      </div>
    );
  }

  const metricLabel = getMetricLabel(dataKey);

  return (
    <div className="h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stop1} stopOpacity={stop1Opacity} />
              <stop offset="100%" stopColor={stop2} stopOpacity={stop2Opacity} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} tickMargin={12} stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} width={48} stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <RechartsTooltip
            cursor={{ stroke, strokeOpacity: 0.35 }}
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 10, color: 'hsl(var(--card-foreground))', fontSize: 12, boxShadow: '0 14px 34px rgba(15,23,42,0.12)' }}
            labelFormatter={(label) => `${label} ${year}`}
            formatter={(value: number) => [formatCurrency(value), metricLabel]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={stroke}
            strokeWidth={3}
            fill={`url(#${gradientId})`}
            dot={{ r: 4, strokeWidth: 2, stroke, fill: stroke }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: activeDotStroke ?? stroke, fill: stroke }}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}



export default function Dashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const { business } = useBusiness();
  const businessId = business?.id ?? null;
  const { isAdmin, isManager, displayName, onboardingCompleted, user, isStaffMember, hasModule } = useAuth();
  const { financials, loading: financialsLoading } = useBusinessFinancials();
  const [data, setData] = useState<DashboardData>({
    sales: [],
    saleItems: [],
    products: [],
    expenses: [],
    otherIncome: [],
    savings: [],
    investments: [],
    investorFunds: [],
    restocks: [],
  });
  const [loading, setLoading] = useState(true);
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [localOnboardingCompleted, setLocalOnboardingCompleted] = useState(false);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [analyticsMetric, setAnalyticsMetric] = useState<AnalyticsMetric>('sales');

  const year = Number(selectedYear);
  const month = selectedMonth === null ? null : Number(selectedMonth);
  const day = selectedDay === null ? null : Number(selectedDay);
  const daysInSelectedMonth = month === null ? 31 : new Date(year, month + 1, 0).getDate();
  const dateRange = (() => {
    if (month === null) {
      return { from: startOfYear(year), to: endOfYear(year), label: String(year) };
    }
    if (day !== null) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        from: iso,
        to: iso,
        label: new Date(year, month, day).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' }),
      };
    }
    return {
      from: startOfMonth(year, month),
      to: endOfMonth(year, month),
      label: new Date(year, month, 1).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }),
    };
  })();

  // Reset day when month/year changes if it falls outside the new month
  useEffect(() => {
    if (selectedDay !== null && Number(selectedDay) > daysInSelectedMonth) {
      setSelectedDay(null);
    }
    if (month === null && selectedDay !== null) {
      setSelectedDay(null);
    }
  }, [month, year, selectedDay, daysInSelectedMonth]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [salesRes, saleItemsRes, productsRes, expensesRes, otherIncomeRes, savingsRes, investmentsRes, investorFundsRes, restocksRes] = await Promise.allSettled([
        supabase.from('sales').select('*').order('sale_date', { ascending: false }),
        supabase.from('sale_items').select('*'),
        loadProductsCompat(false, businessId),
        supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('other_income' as any).select('*').order('income_date', { ascending: false }),
        supabase.from('savings').select('id,amount,savings_date,source,note,reference'),
        supabase.from('investments').select('amount,investment_date'),
        supabase.from('investor_funding').select('amount,date_received,investor_name,reference').order('date_received', { ascending: false }),
        supabase.from('restocks').select('total_cost,status,restock_date,is_opening_stock').order('restock_date', { ascending: false }),
      ]);

      if (salesRes.status === 'rejected') logSupabaseError('dashboard.load.sales', salesRes.reason);
      if (saleItemsRes.status === 'rejected') logSupabaseError('dashboard.load.saleItems', saleItemsRes.reason);
      if (productsRes.status === 'rejected') logSupabaseError('dashboard.load.products', productsRes.reason);
      if (expensesRes.status === 'rejected') logSupabaseError('dashboard.load.expenses', expensesRes.reason);
      if (otherIncomeRes.status === 'rejected') logSupabaseError('dashboard.load.otherIncome', otherIncomeRes.reason);
      if (savingsRes.status === 'rejected') logSupabaseError('dashboard.load.savings', savingsRes.reason);
      if (investmentsRes.status === 'rejected') logSupabaseError('dashboard.load.investments', investmentsRes.reason);
      if (investorFundsRes.status === 'rejected') logSupabaseError('dashboard.load.investorFunds', investorFundsRes.reason);
      if (restocksRes.status === 'rejected') logSupabaseError('dashboard.load.restocks', restocksRes.reason);

      if (salesRes.status === 'fulfilled' && salesRes.value.error) logSupabaseError('dashboard.load.sales', salesRes.value.error);
      if (saleItemsRes.status === 'fulfilled' && saleItemsRes.value.error) logSupabaseError('dashboard.load.saleItems', saleItemsRes.value.error);
      if (expensesRes.status === 'fulfilled' && expensesRes.value.error) logSupabaseError('dashboard.load.expenses', expensesRes.value.error);
      if (otherIncomeRes.status === 'fulfilled' && otherIncomeRes.value.error) logSupabaseError('dashboard.load.otherIncome', otherIncomeRes.value.error);
      if (savingsRes.status === 'fulfilled' && savingsRes.value.error) logSupabaseError('dashboard.load.savings', savingsRes.value.error);
      if (investmentsRes.status === 'fulfilled' && investmentsRes.value.error) logSupabaseError('dashboard.load.investments', investmentsRes.value.error);
      if (investorFundsRes.status === 'fulfilled' && investorFundsRes.value.error) logSupabaseError('dashboard.load.investorFunds', investorFundsRes.value.error);
      if (restocksRes.status === 'fulfilled' && restocksRes.value.error) logSupabaseError('dashboard.load.restocks', restocksRes.value.error);

      setData({
        sales: salesRes.status === 'fulfilled' ? ((salesRes.value.data || []) as SaleRow[]) : [],
        saleItems: saleItemsRes.status === 'fulfilled' ? ((saleItemsRes.value.data || []) as SaleItemRow[]) : [],
        products: productsRes.status === 'fulfilled' ? ((Array.isArray(productsRes.value) ? productsRes.value : []) as ProductRow[]) : [],
        expenses: expensesRes.status === 'fulfilled' ? ((expensesRes.value.data || []) as ExpenseRow[]) : [],
        otherIncome: otherIncomeRes.status === 'fulfilled' ? ((otherIncomeRes.value.data || []) as OtherIncomeRow[]) : [],
        savings: savingsRes.status === 'fulfilled' ? ((savingsRes.value.data || []) as SavingsRow[]) : [],
        investments: investmentsRes.status === 'fulfilled' ? ((investmentsRes.value.data || []) as InvestmentRow[]) : [],
        investorFunds: investorFundsRes.status === 'fulfilled' ? ((investorFundsRes.value.data || []) as FundingRow[]) : [],
        restocks: restocksRes.status === 'fulfilled' ? ((restocksRes.value.data || []) as RestockRow[]) : [],
      });
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void fetchDashboard();
    const refresh = () => { void fetchDashboard(); };
    const channel = supabase
      .channel('dashboard-sales-inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investor_funding' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchDashboard]);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') {
      setLocalOnboardingCompleted(false);
      return;
    }
    const completed = window.localStorage.getItem(getOnboardingCompletionKey(user.id)) === 'true';
    setLocalOnboardingCompleted(completed);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined' || !onboardingCompleted) return;
    window.localStorage.setItem(getOnboardingCompletionKey(user.id), 'true');
    setLocalOnboardingCompleted(true);
  }, [onboardingCompleted, user?.id]);

  // Team members inherit the owner's workspace and never see fresh-setup onboarding.
  const setupRequired = !isStaffMember && (!business || (!onboardingCompleted && !localOnboardingCompleted));

  useEffect(() => {
    if (!setupRequired) {
      setSetupDialogOpen(false);
      setSetupDismissed(false);
      return;
    }
    if (!setupDismissed && (isAdmin || isManager || !business)) {
      setSetupDialogOpen(true);
    }
  }, [business, isAdmin, isManager, setupDismissed, setupRequired]);

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    const values = [
      ...data.sales.map((row) => row.sale_date),
      ...data.expenses.map((row) => row.expense_date),
      ...data.otherIncome.map((row) => row.income_date),
      ...data.savings.map((row) => row.savings_date),
      ...data.investments.map((row) => row.investment_date),
      ...data.investorFunds.map((row) => row.date_received),
    ];
    values.forEach((value) => {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) years.add(parsed.getFullYear());
    });
    return Array.from(years).sort((left, right) => right - left);
  }, [currentYear, data.expenses, data.investments, data.investorFunds, data.otherIncome, data.sales, data.savings]);

  const filtered = useMemo(() => {
    const sales = data.sales.filter((row) => inRange(row.sale_date, dateRange.from, dateRange.to));
    const saleIds = new Set(sales.map((row) => row.id));
    return {
      sales,
      saleItems: data.saleItems.filter((item) => saleIds.has(item.sale_id)),
      expenses: data.expenses.filter((row) => inRange(row.expense_date, dateRange.from, dateRange.to)),
      otherIncome: data.otherIncome.filter((row) => inRange(row.income_date, dateRange.from, dateRange.to)),
      savings: data.savings.filter((row) => inRange(row.savings_date, dateRange.from, dateRange.to)),
      investments: data.investments.filter((row) => inRange(row.investment_date, dateRange.from, dateRange.to)),
      investorFunds: data.investorFunds.filter((row) => inRange(row.date_received, dateRange.from, dateRange.to)),
      products: data.products,
    };
  }, [data, dateRange.from, dateRange.to]);

  // Filtered financials — respects the selected month/year filter for every
  // money card on the dashboard. Stock Left + Low Stock still use the full
  // product list (real-time inventory, not historical).
  const filteredFinancials = useMemo(
    () =>
      calculateBusinessFinancials({
        sales: filtered.sales as any,
        saleItems: filtered.saleItems as any,
        products: data.products as any,
        otherIncome: filtered.otherIncome as any,
        expenses: filtered.expenses as any,
        savings: filtered.savings as any,
        investments: filtered.investments as any,
        investorFunds: filtered.investorFunds as any,
        restocks: data.restocks as any,
        openingCashBalance: financials.openingCash,
      }),
    [filtered, data.products, data.restocks, financials.openingCash],
  );

  // Cumulative financials — running balance UP TO the end of the selected
  // period. Used for "Available Business Money" so the card represents the
  // business cash position as of the selected date, not just transactions
  // inside the filter window.
  const cumulativeFinancials = useMemo(() => {
    const toMs = new Date(`${dateRange.to}T23:59:59`).getTime();
    const upTo = (value: string | null | undefined) => {
      if (!value) return false;
      const t = new Date(value).getTime();
      return !Number.isNaN(t) && t <= toMs;
    };
    const sales = data.sales.filter((row) => upTo(row.sale_date));
    const saleIds = new Set(sales.map((row) => row.id));
    return calculateBusinessFinancials({
      sales: sales as any,
      saleItems: data.saleItems.filter((item) => saleIds.has(item.sale_id)) as any,
      products: data.products as any,
      otherIncome: data.otherIncome.filter((row) => upTo(row.income_date)) as any,
      expenses: data.expenses.filter((row) => upTo(row.expense_date)) as any,
      savings: data.savings.filter((row) => upTo(row.savings_date)) as any,
      investments: data.investments.filter((row) => upTo(row.investment_date)) as any,
      investorFunds: data.investorFunds.filter((row) => upTo(row.date_received)) as any,
      restocks: data.restocks.filter((row: any) => upTo(row.restock_date)) as any,
      openingCashBalance: financials.openingCash,
    });
  }, [data, dateRange.to, financials.openingCash]);

  const todayInRange = inRange(new Date().toISOString(), dateRange.from, dateRange.to);
  const dailySales = useMemo(() => {
    // Today falls within the selected month/year → live today's sales
    if (todayInRange) return sumTodaySales(data.sales);
    // Past/future period → period total
    return filteredFinancials.paidSalesRevenue;
  }, [todayInRange, data.sales, filteredFinancials.paidSalesRevenue]);

  const yesterdaySales = useMemo(() => {
    if (!todayInRange) return 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return sumTodaySales(data.sales, yesterday);
  }, [todayInRange, data.sales]);

  const lowStockProducts = useMemo(
    () =>
      data.products
        .filter((product) => !product.is_archived && toNumber(product.quantity) <= toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0))
        .slice(0, 4),
    [data.products],
  );
  const stockPanelProducts = useMemo(
    () =>
      [...data.products]
        .filter((product) => !product.is_archived)
        .sort((left, right) => toNumber(left.quantity) - toNumber(right.quantity) || left.name.localeCompare(right.name))
        .slice(0, 6),
    [data.products],
  );
  const negativeStockProducts = useMemo(
    () => data.products.filter((product) => !product.is_archived && toNumber(product.quantity) < 0),
    [data.products],
  );

  // Previous period financials — for KPI trend % deltas.
  const previousFinancials = useMemo(() => {
    const fromMs = new Date(`${dateRange.from}T00:00:00`).getTime();
    const toMs = new Date(`${dateRange.to}T23:59:59`).getTime();
    const span = toMs - fromMs;
    const prevToMs = fromMs - 1;
    const prevFromMs = prevToMs - span;
    const inPrev = (value: string | null | undefined) => {
      if (!value) return false;
      const t = new Date(value).getTime();
      return !Number.isNaN(t) && t >= prevFromMs && t <= prevToMs;
    };
    const sales = data.sales.filter((row) => inPrev(row.sale_date));
    const saleIds = new Set(sales.map((row) => row.id));
    return calculateBusinessFinancials({
      sales: sales as any,
      saleItems: data.saleItems.filter((item) => saleIds.has(item.sale_id)) as any,
      products: data.products as any,
      otherIncome: data.otherIncome.filter((row) => inPrev(row.income_date)) as any,
      expenses: data.expenses.filter((row) => inPrev(row.expense_date)) as any,
      savings: data.savings.filter((row) => inPrev(row.savings_date)) as any,
      investments: data.investments.filter((row) => inPrev(row.investment_date)) as any,
      investorFunds: data.investorFunds.filter((row) => inPrev(row.date_received)) as any,
      restocks: data.restocks as any,
      openingCashBalance: financials.openingCash,
    });
  }, [data, dateRange.from, dateRange.to, financials.openingCash]);

  const periodSparklineData = useMemo(() => {
    if (month === null) {
      return Array.from({ length: 12 }, (_, monthIndex) => {
        const from = startOfMonth(year, monthIndex);
        const to = endOfMonth(year, monthIndex);
        const sales = data.sales.filter((row) => inRange(row.sale_date, from, to));
        const saleIds = new Set(sales.map((row) => row.id));
        const financials = calculateBusinessFinancials({
          sales: sales as any,
          saleItems: data.saleItems.filter((item) => saleIds.has(item.sale_id)) as any,
          products: data.products as any,
          otherIncome: data.otherIncome.filter((row) => inRange(row.income_date, from, to)) as any,
          expenses: data.expenses.filter((row) => inRange(row.expense_date, from, to)) as any,
          savings: data.savings.filter((row) => inRange(row.savings_date, from, to)) as any,
          investments: data.investments.filter((row) => inRange(row.investment_date, from, to)) as any,
          investorFunds: data.investorFunds.filter((row) => inRange(row.date_received, from, to)) as any,
          restocks: data.restocks.filter((row) => inRange(row.restock_date, from, to)) as any,
          openingCashBalance: 0,
        });

        return {
          label: new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-GH', { month: 'short' }),
          sales: financials.paidSalesRevenue,
          expenses: financials.expenses,
          profit: financials.profit,
          businessMoney: financials.availableBusinessMoney,
        };
      });
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const sales = data.sales.filter((row) => inRange(row.sale_date, isoDate, isoDate));
      const saleIds = new Set(sales.map((row) => row.id));
      const financials = calculateBusinessFinancials({
        sales: sales as any,
        saleItems: data.saleItems.filter((item) => saleIds.has(item.sale_id)) as any,
        products: data.products as any,
        otherIncome: data.otherIncome.filter((row) => inRange(row.income_date, isoDate, isoDate)) as any,
        expenses: data.expenses.filter((row) => inRange(row.expense_date, isoDate, isoDate)) as any,
        savings: data.savings.filter((row) => inRange(row.savings_date, isoDate, isoDate)) as any,
        investments: data.investments.filter((row) => inRange(row.investment_date, isoDate, isoDate)) as any,
        investorFunds: data.investorFunds.filter((row) => inRange(row.date_received, isoDate, isoDate)) as any,
        restocks: data.restocks.filter((row) => inRange(row.restock_date, isoDate, isoDate)) as any,
        openingCashBalance: 0,
      });

      return {
        label: String(day).padStart(2, '0'),
        sales: financials.paidSalesRevenue,
        expenses: financials.expenses,
        profit: financials.profit,
        businessMoney: financials.availableBusinessMoney,
      };
    });
  }, [data, year, month]);

  const yearlyAnalyticsData = useMemo(() => buildYearlyAnalyticsData(data, year), [data, year]);

  const analyticsSummary = useMemo(
    () => buildAnalyticsSummary(yearlyAnalyticsData, analyticsMetric, year),
    [analyticsMetric, yearlyAnalyticsData, year],
  );

  const sparklineSeries = {
    sales: periodSparklineData.map((row) => row.sales),
    profit: periodSparklineData.map((row) => row.profit),
    expenses: periodSparklineData.map((row) => row.expenses),
    businessMoney: periodSparklineData.map((row) => row.businessMoney),
  };

  if (loading || financialsLoading) {
    return (
      <AppLayout title="Dashboard">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-36 animate-pulse bg-muted/40" />
          ))}
        </div>
      </AppLayout>
    );
  }

  const isDefaultLiveView = month === null && year === currentYear;
  const businessMoneyValue = isDefaultLiveView ? financials.availableBusinessMoney : cumulativeFinancials.availableBusinessMoney;

  const trends = {
    dailySales: todayInRange
      ? computeTrend(dailySales, yesterdaySales)
      : computeTrend(filteredFinancials.paidSalesRevenue, previousFinancials.paidSalesRevenue),
    profit: computeTrend(filteredFinancials.profit, previousFinancials.profit),
    expenses: computeTrend(filteredFinancials.expenses, previousFinancials.expenses),
    businessMoney: computeTrend(businessMoneyValue, previousFinancials.availableBusinessMoney),
  };
  // For expenses, an increase is "bad" — flip semantic color by inverting direction display.
  const expensesTrendDisplay = trends.expenses.direction === 'flat'
    ? trends.expenses
    : { ...trends.expenses, direction: trends.expenses.direction === 'up' ? 'down' as const : 'up' as const };

  const firstName = (displayName || business?.name || 'there').split(' ')[0];

  return (
    <AppLayout title="Dashboard">
      <div className="mx-auto max-w-[1530px] space-y-4">
        <SubscriptionBanner showAnnouncements={false} />

        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-4 sm:p-6">
          <div className="relative space-y-6">
            {/* HEADER */}
            <motion.section
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div className="min-w-0 space-y-2">
                <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-[32px]">
                  {getGreeting()}, {firstName} <span className="inline-block animate-[wave_1.6s_ease-in-out]">👋</span>
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 sm:text-base">Here&apos;s your business performance for {dateRange.label}.</p>
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-3">
                {hasModule('sales') ? (
                  <Button asChild className="h-12 rounded-[8px] bg-[#2C8603] px-5 text-white hover:bg-[#2C8603]">
                    <Link to="/sales?newSale=1"><Plus className="mr-2 h-4 w-4" />New Sale</Link>
                  </Button>
                ) : null}

                <Select
                  value={selectedDay ?? 'all'}
                  onValueChange={(value) => setSelectedDay(value === 'all' ? null : value)}
                  disabled={month === null}
                >
                  <SelectTrigger className="h-12 w-[110px] rounded-[8px] border-border bg-card px-3 text-foreground">
                    <SelectValue placeholder="Day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Days</SelectItem>
                    {Array.from({ length: daysInSelectedMonth }).map((_, index) => (
                      <SelectItem key={index + 1} value={String(index + 1)}>{index + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedMonth ?? 'all'}
                  onValueChange={(value) => {
                    setSelectedMonth(value === 'all' ? null : value);
                  }}
                >
                  <SelectTrigger className="h-12 w-[140px] rounded-[8px] border-border bg-card px-3 text-foreground">
                    <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Months</SelectItem>
                    {Array.from({ length: 12 }).map((_, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {new Date(2000, index, 1).toLocaleDateString('en-GH', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-12 w-[120px] rounded-[8px] border-border bg-card px-3 text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((availableYear) => (
                      <SelectItem key={availableYear} value={String(availableYear)}>{availableYear}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.section>

        {negativeStockProducts.length > 0 ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-1">
              <p className="font-medium text-amber-600 dark:text-amber-200">Some products have negative stock. Restock required.</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-100/80">
                {negativeStockProducts.slice(0, 4).map((product) => `${product.name} (${toNumber(product.quantity)})`).join(', ')}
                {negativeStockProducts.length > 4 ? ` and ${negativeStockProducts.length - 4} more` : ''}
              </p>
            </div>
          </div>
        ) : null}

        {financials.availableBusinessMoney < 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-amber-700 dark:text-amber-200">
              Negative cash-flow mode active. Daily sales are being used to offset the deficit — savings and expenses deduct from today's sales first before deepening the negative balance.
            </p>
          </div>
        ) : null}

        {/* TOP 4 KPI CARDS */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            index={0}
            title="Daily Sales"
            value={dailySales}
            icon={ShoppingCart}
            trend={trends.dailySales}
            iconClassName="bg-[rgba(44,134,3,0.12)] text-[#2C8603] dark:bg-[rgba(44,134,3,0.18)] dark:text-[#2C8603]"
            glowClassName="bg-[#2C8603]"
            sparklineColor="#2C8603"
            sparklineData={sparklineSeries.sales}
          />
          <KpiCard
            index={1}
            title="Total Profit"
            value={filteredFinancials.profit}
            icon={TrendingUp}
            trend={trends.profit}
            iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/25 dark:text-[#38f085]"
            glowClassName="bg-emerald-500"
            sparklineColor="#35df74"
            sparklineData={sparklineSeries.profit}
          />
          <KpiCard
            index={2}
            title="Expenses"
            value={filteredFinancials.expenses}
            icon={Receipt}
            trend={expensesTrendDisplay}
            iconClassName="bg-[rgba(44,134,3,0.12)] text-[#2C8603] dark:bg-[rgba(44,134,3,0.18)] dark:text-[#2C8603]"
            glowClassName="bg-[#2C8603]"
            sparklineColor="#2C8603"
            sparklineData={sparklineSeries.expenses}
          />
          <KpiCard
            index={3}
            title="Available Business Money"
            value={businessMoneyValue}
            icon={WalletCards}
            trend={trends.businessMoney}
            iconClassName="bg-sky-100 text-sky-600 dark:bg-blue-500/25 dark:text-[#35c7ff]"
            glowClassName="bg-blue-500"
            sparklineColor="#3f8cff"
            sparklineData={sparklineSeries.businessMoney}
          />
        </div>

        {/* SECONDARY METRICS */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric
            index={0}
            title="Stock Left"
            value={financials.stockLeft}
            icon={Boxes}
            helper="Live inventory units"
            iconClassName="bg-[rgba(44,134,3,0.12)] text-[#2C8603] dark:bg-[rgba(44,134,3,0.15)] dark:text-[#2C8603]"
          />
          <MiniMetric
            index={1}
            title="Other Income"
            value={filteredFinancials.otherIncome}
            icon={HandCoins}
            isCurrency
            helper={`In ${selectedYear}`}
            iconClassName="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-[#35df74]"
          />
          <MiniMetric
            index={2}
            title="Low Stock Alerts"
            value={financials.lowStockCount}
            icon={AlertTriangle}
            valueClassName={financials.lowStockCount > 0 ? 'text-amber-500' : undefined}
            helper={lowStockProducts.length > 0 ? lowStockProducts.map((p) => p.name).join(', ') : 'No low-stock items'}
            iconClassName="bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-[#ff9f1c]"
          />
          <MiniMetric
            index={3}
            title="Savings"
            value={filteredFinancials.savings}
            icon={WalletCards}
            isCurrency
            helper={`In ${selectedYear}`}
            iconClassName="bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-[#38bdf8]"
          />
        </div>

        {setupRequired ? (
          <EmptyState
            icon={<Package className="h-7 w-7 text-muted-foreground" />}
            title="Add your first product to start selling"
            description="Set up your business and opening stock so the dashboard can show live figures instead of an empty workspace."
            action={<Button onClick={() => setSetupDialogOpen(true)}>Start setup</Button>}
          />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1.85fr_1fr]">
            {/* ANALYTICS — TABBED CHART */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="relative overflow-hidden rounded-[14px] border border-border bg-card"
            >

              <div className="relative space-y-5 p-5 sm:p-6">
                <Tabs value={analyticsMetric} onValueChange={(value) => setAnalyticsMetric(value as AnalyticsMetric)} className="space-y-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Business Analytics</h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedYear}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <TabsList className="h-11 rounded-[9px] bg-slate-100 p-1 dark:bg-[#0a111b]">
                        <TabsTrigger value="sales" className="h-9 rounded-[7px] px-5 text-sm text-slate-600 data-[state=active]:bg-[#2C8603] data-[state=active]:text-white dark:text-slate-300 dark:data-[state=active]:text-white">Sales</TabsTrigger>
                        <TabsTrigger value="profit" className="h-9 rounded-[7px] px-5 text-sm text-slate-600 data-[state=active]:bg-[#2C8603] data-[state=active]:text-white dark:text-slate-300 dark:data-[state=active]:text-white">Profit</TabsTrigger>
                        <TabsTrigger value="expenses" className="h-9 rounded-[7px] px-5 text-sm text-slate-600 data-[state=active]:bg-[#2C8603] data-[state=active]:text-white dark:text-slate-300 dark:data-[state=active]:text-white">Expenses</TabsTrigger>
                      </TabsList>
                      <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="h-11 w-[148px] rounded-[8px] border-slate-200 bg-white px-4 text-sm text-slate-950 shadow-sm ring-offset-white focus:ring-[#2C8603]/30 dark:border-[#263247] dark:bg-[#0a111b] dark:text-white dark:ring-offset-[#070b12] dark:focus:ring-[#2C8603]/40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableYears.map((availableYear) => (
                            <SelectItem key={availableYear} value={String(availableYear)}>
                              {availableYear === currentYear ? 'This Year' : availableYear}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <TabsContent value="sales" className="mt-0">
                    <AnalyticsChart data={yearlyAnalyticsData} dataKey="sales" gradientId="gradSales" stroke="#2C8603" stop1="#2C8603" stop2="#2C8603" stop1Opacity={0.18} stop2Opacity={0.02} activeDotStroke="#2C8603" emptyText="No paid sales recorded for this year yet." year={year} />
                  </TabsContent>
                  <TabsContent value="profit" className="mt-0">
                    <AnalyticsChart data={yearlyAnalyticsData} dataKey="profit" gradientId="gradProfit" stroke="#35df74" stop1="#22c55e" stop2="#111827" emptyText="No profit data for this year." year={year} />
                  </TabsContent>
                  <TabsContent value="expenses" className="mt-0">
                    <AnalyticsChart data={yearlyAnalyticsData} dataKey="expenses" gradientId="gradExp" stroke="#fb4960" stop1="#f43f5e" stop2="#111827" emptyText="No expenses recorded for this year." year={year} />
                  </TabsContent>
                </Tabs>

                <div className="grid overflow-hidden rounded-[10px] border border-slate-200 bg-white/80 shadow-sm dark:border-[#223044] dark:bg-[#0a111b]/75 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="border-b border-slate-200 p-4 dark:border-[#223044] sm:border-r xl:border-b-0">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{analyticsSummary.totalLabel}</p>
                    <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">{formatCurrency(analyticsSummary.total)}</p>
                  </div>
                  <div className="border-b border-slate-200 p-4 dark:border-[#223044] xl:border-b-0 xl:border-r">
                    <p className="text-sm text-slate-500 dark:text-slate-400">{analyticsSummary.averageLabel}</p>
                    <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">{formatCurrency(analyticsSummary.average)}</p>
                  </div>
                  <div className="border-b border-slate-200 p-4 dark:border-[#223044] sm:border-r sm:border-b-0">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Highest Month</p>
                    <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">{analyticsSummary.highest}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Lowest Month</p>
                    <p className="mt-2 text-base font-semibold text-slate-950 dark:text-white">{analyticsSummary.lowest}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* RIGHT SIDE — LOW STOCK ALERTS */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="relative overflow-hidden rounded-[14px] border border-border bg-card"
            >

              <div className="relative flex h-full min-h-[470px] flex-col space-y-5 p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Low-Stock Alerts</h3>
                  <span className="rounded-[7px] bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">↯ Live</span>
                </div>

                <div className="flex flex-1 flex-col rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#223044] dark:bg-[#090f18]/75">
                  {stockPanelProducts.length > 0 ? (
                    <div className="space-y-3 overflow-y-auto pr-1">
                      {stockPanelProducts.map((product, idx) => {
                        const qty = Math.max(0, toNumber(product.quantity));
                        const threshold = Math.max(0, toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0));
                        const targetStock = Math.max(qty, threshold * 3, 1);
                        const stockPercent = Math.min(100, Math.max(qty > 0 ? 8 : 0, Math.round((qty / targetStock) * 100)));
                        const isLow = threshold > 0 && qty <= threshold;
                        const isCritical = threshold > 0 && qty <= Math.max(1, threshold / 2);

                        return (
                          <motion.div
                            key={product.id}
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.35 + idx * 0.06 }}
                            className="rounded-[10px] border border-slate-200 bg-slate-50/90 p-3 transition-colors hover:border-[rgba(44,134,3,0.35)] dark:border-[#223044] dark:bg-[#0c121b] dark:hover:border-[rgba(44,134,3,0.35)]"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-slate-100 dark:bg-slate-800/80">
                                {product.image_url ? (
                                  <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                                ) : (
                                  <Package className="h-5 w-5 text-slate-400 dark:text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{product.name}</p>
                                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{product.category || 'Uncategorized'}</p>
                                  </div>
                                  <span className={cn(
                                    'shrink-0 text-sm font-semibold',
                                    isCritical ? 'text-rose-500 dark:text-rose-400' : isLow ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200',
                                  )}>
                                    {qty} {qty === 1 ? 'unit' : 'units'}
                                  </span>
                                </div>
                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/80 dark:bg-[#1b2637]">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${stockPercent}%` }}
                                    transition={{ duration: 0.55, delay: 0.45 + idx * 0.05, ease: 'easeOut' }}
                                    className={cn(
                                      'h-full rounded-full',
                                      isCritical ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-[#2C8603]',
                                    )}
                                  />
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                      <div className="relative mb-7 flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800/80">
                        <Package className="h-12 w-12 text-slate-400 dark:text-slate-400" />
                        <span className="absolute bottom-2 right-1 flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(44,134,3,0.25)] bg-[rgba(44,134,3,0.15)] text-[#2C8603] shadow-[0_8px_24px_rgba(44,134,3,0.12)] dark:text-[#2C8603]">
                          <CheckCircle2 className="h-6 w-6" />
                        </span>
                      </div>
                      <p className="text-base font-medium text-slate-900 dark:text-white">No products yet</p>
                      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Add products to see live stock details here.</p>
                    </div>
                  )}
                </div>

                {hasModule('inventory') ? (
                  <Button asChild variant="outline" className="h-12 w-full rounded-[8px] border-[rgba(44,134,3,0.35)] bg-white text-[#2C8603] hover:border-[#2C8603] hover:bg-[rgba(44,134,3,0.08)] hover:text-[#2C8603] dark:border-[rgba(44,134,3,0.32)] dark:bg-transparent dark:text-[#2C8603] dark:hover:border-[#2C8603] dark:hover:bg-[rgba(44,134,3,0.12)] dark:hover:text-white">
                    <Link to="/inventory" className="flex items-center justify-center gap-2">
                      View Inventory
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}
          </div>
        </div>

        <FirstTimeSetupDialog
          open={setupDialogOpen}
          onOpenChange={(nextOpen) => {
            setSetupDialogOpen(nextOpen);
            if (!nextOpen && setupRequired) setSetupDismissed(true);
          }}
          onCompleted={() => {
            if (user?.id && typeof window !== 'undefined') {
              window.localStorage.setItem(getOnboardingCompletionKey(user.id), 'true');
            }
            setLocalOnboardingCompleted(true);
            setSetupDismissed(false);
            setSetupDialogOpen(false);
            void fetchDashboard();
          }}
        />
      </div>
    </AppLayout>

  );
}
