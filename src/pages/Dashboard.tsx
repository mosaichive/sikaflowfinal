import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, HandCoins, Package, Plus, Receipt, ShoppingCart, Sparkles, TrendingUp, WalletCards } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency, SIKAFLOW_TOOLTIPS } from '@/lib/constants';
import { calculateDashboardTotals, getPaidAmount, getIsoDate, sumTodaySales, toNumber } from '@/lib/sales-inventory';
import { AVAILABLE_BUSINESS_MONEY_FORMULA, calculateBusinessFinancials } from '@/lib/business-money';
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
  quantity: number | null;
  selling_price: number | string | null;
  cost_price?: number | string | null;
  low_stock_threshold?: number | null;
  reorder_level?: number | null;
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

function buildDailyDelta(today: number, yesterday: number) {
  const difference = today - yesterday;
  if (Math.abs(difference) < 0.01) {
    return { label: 'No change vs yesterday', tone: 'muted', icon: TrendingUp };
  }
  if (difference > 0) {
    return { label: `${formatCurrency(difference)} more than yesterday`, tone: 'up', icon: ArrowUpRight };
  }
  return { label: `${formatCurrency(Math.abs(difference))} below yesterday`, tone: 'down', icon: ArrowDownRight };
}

function buildRecentActivity(data: DashboardData, from: string, to: string) {
  const entries = [
    ...data.sales
      .filter((sale) => inRange(sale.sale_date, from, to))
      .map((sale) => ({
        id: `sale-${sale.id}`,
        title: sale.customer_name ? `Sale to ${sale.customer_name}` : 'Walk-in sale',
        subtitle: new Date(sale.sale_date).toLocaleDateString('en-GH'),
        amount: getPaidAmount(sale),
        direction: 'in' as const,
        date: sale.sale_date,
        icon: ShoppingCart,
        tone: 'text-emerald-500',
      })),
    ...data.otherIncome
      .filter((row) => inRange(row.income_date, from, to))
      .map((row) => ({
        id: `income-${row.id}`,
        title: row.category,
        subtitle: row.description || new Date(row.income_date).toLocaleDateString('en-GH'),
        amount: toNumber(row.amount),
        direction: 'in' as const,
        date: row.income_date,
        icon: HandCoins,
        tone: 'text-emerald-500',
      })),
    ...data.expenses
      .filter((row) => inRange(row.expense_date, from, to))
      .map((row) => ({
        id: `expense-${row.id}`,
        title: row.category || 'Expense',
        subtitle: row.description || new Date(row.expense_date).toLocaleDateString('en-GH'),
        amount: toNumber(row.amount),
        direction: 'out' as const,
        date: row.expense_date,
        icon: Receipt,
        tone: 'text-rose-500',
      })),
    ...data.savings
      .filter((row) => inRange(row.savings_date, from, to))
      .map((row) => ({
        id: `savings-${row.id}`,
        title: 'Savings transfer',
        subtitle:
          row.note ||
          row.reference ||
          (row.source ? `${String(row.source).replace('_', ' ')} savings` : new Date(row.savings_date).toLocaleDateString('en-GH')),
        amount: toNumber(row.amount),
        direction: 'out' as const,
        date: row.savings_date,
        icon: WalletCards,
        tone: 'text-amber-500',
      })),
    ...data.investorFunds
      .filter((row) => inRange(row.date_received, from, to))
      .map((row) => ({
        id: `funding-${row.reference || row.date_received}`,
        title: row.investor_name ? `Investor funds from ${row.investor_name}` : 'Investor funds',
        subtitle: row.reference || new Date(row.date_received).toLocaleDateString('en-GH'),
        amount: toNumber(row.amount),
        direction: 'in' as const,
        date: row.date_received,
        icon: WalletCards,
        tone: 'text-sky-400',
      })),
  ];

  return entries
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 6);
}

function buildSalesChart(sales: SaleRow[], year: number, month: number | null) {
  const grouped = new Map<string, number>();

  if (month === null) {
    for (let index = 0; index < 12; index += 1) {
      grouped.set(new Date(Date.UTC(year, index, 1)).toLocaleDateString('en-GH', { month: 'short' }), 0);
    }

    sales.forEach((sale) => {
      const date = new Date(sale.sale_date);
      if (date.getFullYear() !== year) return;
      const key = new Date(Date.UTC(year, date.getMonth(), 1)).toLocaleDateString('en-GH', { month: 'short' });
      grouped.set(key, (grouped.get(key) || 0) + getPaidAmount(sale));
    });
  } else {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      grouped.set(String(day).padStart(2, '0'), 0);
    }

    sales.forEach((sale) => {
      const date = new Date(sale.sale_date);
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      const key = String(date.getDate()).padStart(2, '0');
      grouped.set(key, (grouped.get(key) || 0) + getPaidAmount(sale));
    });
  }

  return Array.from(grouped.entries()).map(([label, value]) => ({ label, value }));
}

// Premium gradient KPI card used in the top row of the dashboard.
function KpiCard({
  title,
  value,
  icon: Icon,
  helper,
  gradient,
  iconTint,
  trend,
  index = 0,
  isCurrency = true,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  helper?: string;
  gradient: string; // tailwind gradient classes for the soft background
  iconTint: string; // tailwind classes for the icon chip
  trend?: { value: number; label: string; direction: 'up' | 'down' | 'flat' } | null;
  index?: number;
  isCurrency?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -3 }}
      className="group relative"
    >
      {/* Glow */}
      <div className={cn('pointer-events-none absolute -inset-px rounded-3xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-60', gradient)} />
      <div className={cn(
        'relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 backdrop-blur-xl shadow-sm transition-all duration-300 group-hover:shadow-xl group-hover:border-border',
      )}>
        {/* Soft gradient wash */}
        <div className={cn('pointer-events-none absolute inset-0 opacity-70 bg-gradient-to-br', gradient)} />
        {/* Decorative blob */}
        <div className={cn('pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full blur-3xl opacity-30 bg-gradient-to-br', gradient)} />
        <div className="relative flex items-start justify-between">
          <div className="space-y-2 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
              {isCurrency
                ? <AnimatedNumber value={value} formatter={(n) => formatCurrency(n)} />
                : <AnimatedNumber value={value} />}
            </p>
            {trend ? (
              <div className="flex items-center gap-1.5 text-xs">
                <span className={cn(
                  'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
                  trend.direction === 'up' && 'bg-emerald-500/15 text-emerald-500',
                  trend.direction === 'down' && 'bg-rose-500/15 text-rose-500',
                  trend.direction === 'flat' && 'bg-muted text-muted-foreground',
                )}>
                  {trend.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : trend.direction === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
                  {trend.direction === 'flat' ? '0%' : `${trend.direction === 'up' ? '+' : '-'}${Math.abs(trend.value).toFixed(1)}%`}
                </span>
                <span className="text-muted-foreground truncate">{trend.label}</span>
              </div>
            ) : helper ? (
              <p className="text-xs text-muted-foreground line-clamp-1">{helper}</p>
            ) : null}
          </div>
          <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-inner ring-1 ring-inset ring-white/10', iconTint)}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Compact secondary metric (Stock Left, Other Income, etc).
function MiniMetric({
  title,
  value,
  icon: Icon,
  helper,
  valueClassName,
  index = 0,
  isCurrency = false,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  helper?: string;
  valueClassName?: string;
  index?: number;
  isCurrency?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.25 + index * 0.05 }}
      className="group rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur-sm transition-all hover:border-border hover:bg-card hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
          <p className={cn('text-xl font-bold tabular-nums text-foreground', valueClassName)}>
            {typeof value === 'number'
              ? (isCurrency
                  ? <AnimatedNumber value={value} formatter={(n) => formatCurrency(n)} />
                  : <AnimatedNumber value={value} />)
              : value}
          </p>
          {helper ? <p className="text-[11px] text-muted-foreground line-clamp-1">{helper}</p> : null}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </motion.div>
  );
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

// Tabbed analytics chart — area or bar with gradient fill + interactive tooltip.
function AnalyticsChart({
  data, dataKey, gradientId, stroke, stop1, stop2, emptyText, kind,
}: {
  data: { label: string; sales: number; profit: number; expenses: number }[];
  dataKey: 'sales' | 'profit' | 'expenses';
  gradientId: string;
  stroke: string;
  stop1: string;
  stop2: string;
  emptyText: string;
  kind: 'area' | 'bar';
}) {
  const hasData = data.some((row) => (row[dataKey] as number) > 0);
  if (!hasData) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'area' ? (
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stop1} stopOpacity={0.55} />
                <stop offset="100%" stopColor={stop2} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} width={50} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <RechartsTooltip
              cursor={{ stroke, strokeOpacity: 0.2 }}
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Area type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2.5} fill={`url(#${gradientId})`} animationDuration={700} />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stop1} stopOpacity={0.95} />
                <stop offset="100%" stopColor={stop2} stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} width={50} stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <RechartsTooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
              formatter={(value: number) => formatCurrency(value)}
            />
            <Bar dataKey={dataKey} fill={`url(#${gradientId})`} radius={[8, 8, 0, 0]} animationDuration={700} />
          </BarChart>
        )}
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

  const year = Number(selectedYear);
  const month = selectedMonth === null ? null : Number(selectedMonth);
  const day = selectedDay === null ? null : Number(selectedDay);
  const daysInSelectedMonth = month === null ? 31 : new Date(year, month + 1, 0).getDate();
  const dateRange = (() => {
    if (month === null) {
      return { from: startOfYear(year), to: endOfYear(year), label: String(year) };
    }
    if (day === null) {
      return {
        from: startOfMonth(year, month),
        to: endOfMonth(year, month),
        label: new Date(year, month, 1).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }),
      };
    }
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return {
      from: iso,
      to: iso,
      label: new Date(year, month, day).toLocaleDateString('en-GH', { day: 'numeric', month: 'long', year: 'numeric' }),
    };
  })();

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

  const metrics = useMemo(() => calculateDashboardTotals(filtered), [filtered]);

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
    // Specific day selected → exact-day total
    if (day !== null && month !== null) {
      const target = new Date(year, month, day);
      return sumTodaySales(data.sales, target);
    }
    // Today falls within the selected month/year → live today's sales
    if (todayInRange) return sumTodaySales(data.sales);
    // Past/future period → period total
    return filteredFinancials.paidSalesRevenue;
  }, [day, month, year, todayInRange, data.sales, filteredFinancials.paidSalesRevenue]);
  const yesterdaySales = useMemo(() => {
    if (day !== null && month !== null) {
      const target = new Date(year, month, day);
      target.setDate(target.getDate() - 1);
      return sumTodaySales(data.sales, target);
    }
    if (!todayInRange) return 0;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return sumTodaySales(data.sales, yesterday);
  }, [day, month, year, todayInRange, data.sales]);
  const dailyDelta = useMemo(() => buildDailyDelta(dailySales, yesterdaySales), [dailySales, yesterdaySales]);

  const salesChartData = useMemo(() => buildSalesChart(filtered.sales, year, month), [filtered.sales, month, year]);
  const recentActivity = useMemo(() => buildRecentActivity(data, dateRange.from, dateRange.to), [data, dateRange.from, dateRange.to]);
  const lowStockProducts = useMemo(
    () =>
      data.products
        .filter((product) => !product.is_archived && toNumber(product.quantity) <= toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0))
        .slice(0, 4),
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

  // Combined series for the analytics chart tabs.
  const analyticsChartData = useMemo(() => {
    const buckets = new Map<string, { label: string; sales: number; expenses: number }>();
    salesChartData.forEach((row) => {
      buckets.set(row.label, { label: row.label, sales: row.value, expenses: 0 });
    });
    if (month === null) {
      data.expenses.forEach((row) => {
        const date = new Date(row.expense_date);
        if (date.getFullYear() !== year) return;
        const key = new Date(Date.UTC(year, date.getMonth(), 1)).toLocaleDateString('en-GH', { month: 'short' });
        const existing = buckets.get(key) || { label: key, sales: 0, expenses: 0 };
        existing.expenses += toNumber(row.amount);
        buckets.set(key, existing);
      });
    } else {
      data.expenses.forEach((row) => {
        const date = new Date(row.expense_date);
        if (date.getFullYear() !== year || date.getMonth() !== month) return;
        const key = String(date.getDate()).padStart(2, '0');
        const existing = buckets.get(key) || { label: key, sales: 0, expenses: 0 };
        existing.expenses += toNumber(row.amount);
        buckets.set(key, existing);
      });
    }
    return Array.from(buckets.values()).map((row) => ({
      ...row,
      profit: Math.max(0, row.sales - row.expenses),
    }));
  }, [salesChartData, data.expenses, year, month]);


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

  const isDefaultLiveView = month === null && day === null && year === currentYear;
  const businessMoneyValue = isDefaultLiveView ? financials.availableBusinessMoney : cumulativeFinancials.availableBusinessMoney;

  const trends = {
    dailySales: day !== null || todayInRange
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
  const businessName = business?.name || 'your business';

  return (
    <AppLayout title="Dashboard">
      <div className="space-y-6">
        <SubscriptionBanner showAnnouncements={false} />

        {/* HEADER */}
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-5 backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-gradient-to-br from-violet-500/25 via-fuchsia-500/15 to-transparent blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-gradient-to-br from-cyan-400/20 via-blue-500/15 to-transparent blur-3xl" />

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/90">{businessName}</p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {getGreeting()}, {firstName} <span className="inline-block animate-[wave_1.6s_ease-in-out]">👋</span>
              </h1>
              <p className="text-sm text-muted-foreground">Here&apos;s your business performance for {dateRange.label}.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedMonth === null ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedMonth(String(currentMonth))} className="rounded-full">
                  + Month
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => { setSelectedMonth(null); setSelectedDay(null); }}>
                  Year only
                </Button>
              )}

              {selectedMonth !== null ? (
                <Select
                  value={selectedMonth}
                  onValueChange={(value) => {
                    setSelectedMonth(value);
                    if (selectedDay !== null) {
                      const m = Number(value);
                      const max = new Date(year, m + 1, 0).getDate();
                      if (Number(selectedDay) > max) setSelectedDay(String(max));
                    }
                  }}
                >
                  <SelectTrigger className="h-9 w-[140px] rounded-full"><SelectValue placeholder="Month" /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }).map((_, index) => (
                      <SelectItem key={index} value={String(index)}>
                        {new Date(2000, index, 1).toLocaleDateString('en-GH', { month: 'long' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              {selectedMonth !== null ? (
                <Select value={selectedDay ?? 'all'} onValueChange={(value) => setSelectedDay(value === 'all' ? null : value)}>
                  <SelectTrigger className="h-9 w-[110px] rounded-full"><SelectValue placeholder="Day" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All days</SelectItem>
                    {Array.from({ length: daysInSelectedMonth }).map((_, index) => (
                      <SelectItem key={index + 1} value={String(index + 1)}>{index + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-9 w-[100px] rounded-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableYears.map((availableYear) => (
                    <SelectItem key={availableYear} value={String(availableYear)}>{availableYear}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasModule('sales') ? (
                <Button asChild size="sm" className="rounded-full gap-1.5 bg-gradient-to-r from-primary to-fuchsia-500 hover:opacity-95 shadow-md shadow-primary/30">
                  <Link to="/sales?newSale=1"><Plus className="h-4 w-4" />New Sale</Link>
                </Button>
              ) : null}
            </div>
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
            gradient="from-violet-500/15 to-fuchsia-500/5"
            iconTint="bg-gradient-to-br from-violet-500/30 to-fuchsia-500/20 text-violet-400 dark:text-violet-300"
            trend={trends.dailySales}
            helper={day !== null ? `Paid sales on ${dateRange.label}` : todayInRange ? dailyDelta.label : `Total in ${dateRange.label}`}
          />
          <KpiCard
            index={1}
            title="Total Profit"
            value={filteredFinancials.profit}
            icon={TrendingUp}
            gradient="from-emerald-500/15 to-teal-500/5"
            iconTint="bg-gradient-to-br from-emerald-500/30 to-teal-500/20 text-emerald-500 dark:text-emerald-300"
            trend={trends.profit}
            helper={`Revenue − COGS − expenses`}
          />
          <KpiCard
            index={2}
            title="Expenses"
            value={filteredFinancials.expenses}
            icon={Receipt}
            gradient="from-rose-500/15 to-pink-500/5"
            iconTint="bg-gradient-to-br from-rose-500/30 to-pink-500/20 text-rose-500 dark:text-rose-300"
            trend={expensesTrendDisplay}
            helper={`Operating in ${dateRange.label}`}
          />
          <KpiCard
            index={3}
            title="Available Business Money"
            value={businessMoneyValue}
            icon={WalletCards}
            gradient="from-cyan-500/15 to-blue-500/5"
            iconTint="bg-gradient-to-br from-cyan-500/30 to-blue-500/20 text-cyan-500 dark:text-cyan-300"
            trend={trends.businessMoney}
            helper={isDefaultLiveView ? 'Live cash position' : `As of ${dateRange.label}`}
          />
        </div>

        {/* SECONDARY METRICS */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <MiniMetric index={0} title="Stock Left" value={financials.stockLeft} icon={Boxes} helper="Live inventory units" />
          <MiniMetric index={1} title="Other Income" value={filteredFinancials.otherIncome} icon={HandCoins} isCurrency helper={`In ${dateRange.label}`} />
          <MiniMetric
            index={2}
            title="Low Stock Alerts"
            value={financials.lowStockCount}
            icon={AlertTriangle}
            valueClassName={financials.lowStockCount > 0 ? 'text-amber-500' : undefined}
            helper={lowStockProducts.length > 0 ? lowStockProducts.map((p) => p.name).join(', ') : 'No low-stock items'}
          />
          <MiniMetric index={3} title="Savings" value={filteredFinancials.savings} icon={WalletCards} isCurrency helper={`In ${dateRange.label}`} />
        </div>

        {setupRequired ? (
          <EmptyState
            icon={<Package className="h-7 w-7 text-muted-foreground" />}
            title="Add your first product to start selling"
            description="Set up your business and opening stock so the dashboard can show live figures instead of an empty workspace."
            action={<Button onClick={() => setSetupDialogOpen(true)}>Start setup</Button>}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            {/* ANALYTICS — TABBED CHART */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute -top-20 left-1/3 h-48 w-2/3 bg-gradient-to-r from-violet-500/15 via-fuchsia-500/10 to-cyan-500/10 blur-3xl" />
              <div className="relative p-5">
                <Tabs defaultValue="sales" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">Business Analytics</h2>
                      <p className="text-xs text-muted-foreground">{dateRange.label}</p>
                    </div>
                    <TabsList className="rounded-full bg-muted/60 p-1">
                      <TabsTrigger value="sales" className="rounded-full text-xs">Sales</TabsTrigger>
                      <TabsTrigger value="profit" className="rounded-full text-xs">Profit</TabsTrigger>
                      <TabsTrigger value="expenses" className="rounded-full text-xs">Expenses</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="sales" className="mt-0">
                    <AnalyticsChart data={analyticsChartData} dataKey="sales" gradientId="gradSales" stroke="hsl(280 75% 60%)" stop1="hsl(280 75% 60%)" stop2="hsl(200 90% 55%)" emptyText="No paid sales recorded for this period yet." kind="area" />
                  </TabsContent>
                  <TabsContent value="profit" className="mt-0">
                    <AnalyticsChart data={analyticsChartData} dataKey="profit" gradientId="gradProfit" stroke="hsl(160 70% 45%)" stop1="hsl(160 70% 45%)" stop2="hsl(180 80% 50%)" emptyText="No profit data for this period." kind="area" />
                  </TabsContent>
                  <TabsContent value="expenses" className="mt-0">
                    <AnalyticsChart data={analyticsChartData} dataKey="expenses" gradientId="gradExp" stroke="hsl(350 75% 60%)" stop1="hsl(350 75% 60%)" stop2="hsl(20 90% 55%)" emptyText="No expenses recorded for this period." kind="bar" />
                  </TabsContent>
                </Tabs>
              </div>
            </motion.div>

            {/* RIGHT SIDE — LOW STOCK ALERTS */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card/80 to-card/80 backdrop-blur-xl"
            >
              <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-amber-500/15 blur-3xl" />
              <div className="relative p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">Low-Stock Alerts</h3>
                      <p className="text-[11px] text-muted-foreground">{financials.lowStockCount} item(s) need attention</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500">Live</span>
                </div>

                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {lowStockProducts.length > 0 ? lowStockProducts.map((product, idx) => {
                    const qty = toNumber(product.quantity);
                    const threshold = toNumber(product.low_stock_threshold ?? product.reorder_level ?? 0);
                    return (
                      <motion.div
                        key={product.id}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.35 + idx * 0.06 }}
                        className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 py-2.5 backdrop-blur hover:border-amber-500/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{product.name}</p>
                          <p className="text-[11px] text-muted-foreground">Threshold: {threshold}</p>
                        </div>
                        <span className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                          qty <= 0 ? 'bg-rose-500/20 text-rose-500' : qty <= threshold / 2 ? 'bg-amber-500/20 text-amber-500' : 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
                        )}>
                          {qty} left
                        </span>
                      </motion.div>
                    );
                  }) : (
                    <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
                      All products are well stocked 🎉
                    </div>
                  )}
                </div>

                {hasModule('inventory') ? (
                  <Button asChild variant="outline" size="sm" className="w-full rounded-xl border-amber-500/30 hover:bg-amber-500/10 hover:border-amber-500/50">
                    <Link to="/inventory">View Inventory</Link>
                  </Button>
                ) : null}
              </div>
            </motion.div>
          </div>
        )}

        {/* RECENT ACTIVITY */}
        {!setupRequired ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight">Recent Activity</h3>
                <p className="text-xs text-muted-foreground">Sales, income, and expenses within {dateRange.label}</p>
              </div>
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>

            {recentActivity.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2">
                {recentActivity.map((entry, idx) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + idx * 0.04 }}
                    className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/40 p-3 hover:border-border transition-colors"
                  >
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10', entry.tone)}>
                      <entry.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{entry.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{entry.subtitle}</p>
                    </div>
                    <p className={cn('text-sm font-semibold tabular-nums', entry.tone)}>
                      {entry.direction === 'in' ? '+' : '-'}
                      {formatCurrency(entry.amount)}
                    </p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-border/60 text-sm text-muted-foreground">
                No activity for this period yet.
              </div>
            )}
          </motion.div>
        ) : null}

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
