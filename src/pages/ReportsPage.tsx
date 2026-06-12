import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, PAYMENT_METHODS } from '@/lib/constants';
import {
  calculateFinancialSnapshot,
  calculateSalesIncome,
  getPaidAmount,
  isNegativeStockSale,
  isRecognizedSale,
  toNumber,
} from '@/lib/sales-inventory';
import { supabase } from '@/integrations/supabase/client';
import { useBusiness } from '@/context/BusinessContext';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowDownRight, ArrowUpRight, BarChart3, Boxes, Calculator, CalendarRange, ChevronDown, Coins,
  Download, FileSpreadsheet, FileText, FilterX, LayoutGrid, LineChart as LineChartIcon, PackageSearch,
  PiggyBank, Printer, Receipt, ScrollText, ShoppingCart, Sparkles, Tag, TrendingDown, TrendingUp,
  Wallet, WalletCards, Eye,
} from 'lucide-react';
import { buildReportStatement, downloadReportSlipPdf } from '@/lib/report-slip';
import { loadProductsCompat, loadStockMovementsCompat, logSupabaseError } from '@/lib/workspace';
import { useBusinessFinancials } from '@/context/BusinessFinancialsContext';
import { DynamicLineChart } from '@/components/reports/DynamicLineChart';
import { calculateReportCumulativeFinancials, isDefaultLiveDashboardReport } from '@/lib/report-calculations';
import {
  buildDamagedGoodsRowsFromStockMovements,
  calculateDamagedGoodsSummary,
  groupDamagedGoodsByProduct,
  getDamagedGoodsValue,
  isMissingDamagedGoodsSchemaError,
} from '@/lib/damaged-goods';

type RawReportData = {
  sales: any[];
  saleItems: any[];
  expenses: any[];
  savings: any[];
  investments: any[];
  funding: any[];
  restocks: any[];
  otherIncome: any[];
  products: any[];
  stockMovements: any[];
  damagedGoods: any[];
};

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getRangeFromFilters({
  year,
  monthEnabled,
  month,
  useCustomRange,
  customFrom,
  customTo,
}: {
  year: string;
  monthEnabled: boolean;
  month: string;
  useCustomRange: boolean;
  customFrom: string;
  customTo: string;
}) {
  if (useCustomRange && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }

  const numericYear = Number(year);
  if (!Number.isFinite(numericYear)) {
    const now = new Date();
    return { from: formatDateInput(new Date(now.getFullYear(), 0, 1)), to: formatDateInput(now) };
  }

  if (monthEnabled) {
    const monthIndex = Math.max(0, Number(month) - 1);
    const start = new Date(numericYear, monthIndex, 1);
    const end = new Date(numericYear, monthIndex + 1, 0);
    return { from: formatDateInput(start), to: formatDateInput(end) };
  }

  return {
    from: `${numericYear}-01-01`,
    to: `${numericYear}-12-31`,
  };
}

function inDateRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  return timestamp >= start && timestamp <= end;
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const offset = (day + 6) % 7;
  next.setDate(next.getDate() - offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

function getPaymentMethodLabel(value: string | null | undefined) {
  return PAYMENT_METHODS.find((method) => method.value === value)?.label ?? 'Cash';
}

function getCreditStatus(paymentStatus: string | null | undefined, dueDate: string | null | undefined) {
  const normalized = String(paymentStatus || '').toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'partial') return 'Partially Paid';
  if (normalized === 'overdue') return 'Overdue';
  if (normalized === 'unpaid') {
    if (dueDate && new Date(dueDate).getTime() < Date.now()) return 'Overdue';
    return 'Unpaid';
  }
  return dueDate && new Date(dueDate).getTime() < Date.now() ? 'Overdue' : 'Unpaid';
}

export default function ReportsPage() {
  const now = useMemo(() => new Date(), []);
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const { business, businessId } = useBusiness();
  const { displayName, user } = useAuth();
  const { toast } = useToast();
  const { financials, loading: financialsLoading } = useBusinessFinancials();

  const [year, setYear] = useState(currentYear);
  const [monthEnabled, setMonthEnabled] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState(`${currentYear}-01-01`);
  const [customTo, setCustomTo] = useState(formatDateInput(now));
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [salesStockFilter, setSalesStockFilter] = useState<'all' | 'negative_only'>('all');
  const [raw, setRaw] = useState<RawReportData>({
    sales: [],
    saleItems: [],
    expenses: [],
    savings: [],
    investments: [],
    funding: [],
    restocks: [],
    otherIncome: [],
    products: [],
    stockMovements: [],
    damagedGoods: [],
  });

  const { from, to } = useMemo(
    () => getRangeFromFilters({ year, monthEnabled, month, useCustomRange, customFrom, customTo }),
    [year, monthEnabled, month, useCustomRange, customFrom, customTo],
  );

  const invalidRange = from > to;

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const [salesRes, itemsRes, expRes, savRes, invRes, funRes, restockRes, otherIncomeRes, productsRes, stockMovementsRes, damagedGoodsRes] = await Promise.allSettled([
      supabase.from('sales').select('*').order('sale_date', { ascending: false }),
      supabase.from('sale_items').select('*'),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('savings').select('*').order('savings_date', { ascending: false }),
      supabase.from('investments').select('*').order('investment_date', { ascending: false }),
      supabase.from('investor_funding').select('*').order('date_received', { ascending: false }),
      supabase.from('restocks').select('*').order('restock_date', { ascending: false }),
      supabase.from('other_income' as any).select('*').order('income_date', { ascending: false }),
      loadProductsCompat(false, businessId),
      loadStockMovementsCompat(500, businessId),
      supabase.from('damaged_goods' as any).select('*').order('damage_date', { ascending: false }),
    ]);

    const productsData = productsRes.status === 'fulfilled' ? (productsRes.value ?? []) : [];
    const stockMovementsData = stockMovementsRes.status === 'fulfilled' ? (stockMovementsRes.value ?? []) : [];
    const damagedGoodsData =
      damagedGoodsRes.status === 'fulfilled' && !damagedGoodsRes.value.error
        ? (damagedGoodsRes.value.data ?? [])
        : damagedGoodsRes.status === 'fulfilled' && isMissingDamagedGoodsSchemaError(damagedGoodsRes.value.error)
          ? buildDamagedGoodsRowsFromStockMovements(stockMovementsData, productsData)
          : [];

    setRaw({
      sales: salesRes.status === 'fulfilled' && !salesRes.value.error ? (salesRes.value.data ?? []) : [],
      saleItems: itemsRes.status === 'fulfilled' && !itemsRes.value.error ? (itemsRes.value.data ?? []) : [],
      expenses: expRes.status === 'fulfilled' && !expRes.value.error ? (expRes.value.data ?? []) : [],
      savings: savRes.status === 'fulfilled' && !savRes.value.error ? (savRes.value.data ?? []) : [],
      investments: invRes.status === 'fulfilled' && !invRes.value.error ? (invRes.value.data ?? []) : [],
      funding: funRes.status === 'fulfilled' && !funRes.value.error ? (funRes.value.data ?? []) : [],
      restocks: restockRes.status === 'fulfilled' && !restockRes.value.error ? (restockRes.value.data ?? []) : [],
      otherIncome: otherIncomeRes.status === 'fulfilled' && !otherIncomeRes.value.error ? (otherIncomeRes.value.data ?? []) : [],
      products: productsData,
      stockMovements: stockMovementsData,
      damagedGoods: damagedGoodsData,
    });
    if (salesRes.status === 'rejected') logSupabaseError('reports.load.sales', salesRes.reason, { businessId });
    if (itemsRes.status === 'rejected') logSupabaseError('reports.load.saleItems', itemsRes.reason, { businessId });
    if (expRes.status === 'rejected') logSupabaseError('reports.load.expenses', expRes.reason, { businessId });
    if (savRes.status === 'rejected') logSupabaseError('reports.load.savings', savRes.reason, { businessId });
    if (invRes.status === 'rejected') logSupabaseError('reports.load.investments', invRes.reason, { businessId });
    if (funRes.status === 'rejected') logSupabaseError('reports.load.investorFunding', funRes.reason, { businessId });
    if (restockRes.status === 'rejected') logSupabaseError('reports.load.restocks', restockRes.reason, { businessId });
    if (otherIncomeRes.status === 'rejected') logSupabaseError('reports.load.otherIncome', otherIncomeRes.reason, { businessId });
    if (productsRes.status === 'rejected') logSupabaseError('reports.load.products', productsRes.reason, { businessId });
    if (stockMovementsRes.status === 'rejected') logSupabaseError('reports.load.stockMovements', stockMovementsRes.reason, { businessId });
    if (damagedGoodsRes.status === 'rejected') logSupabaseError('reports.load.damagedGoods', damagedGoodsRes.reason, { businessId });
    if (
      damagedGoodsRes.status === 'fulfilled'
      && damagedGoodsRes.value.error
      && !isMissingDamagedGoodsSchemaError(damagedGoodsRes.value.error)
    ) {
      logSupabaseError('reports.load.damagedGoods', damagedGoodsRes.value.error, { businessId });
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    const channel = supabase
      .channel('reports-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_income' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restocks' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'damaged_goods' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'savings' }, () => { void fetchReport(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, () => { void fetchReport(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchReport]);

  const filtered = useMemo(() => {
    if (invalidRange) {
      return {
        sales: [],
        saleItems: [],
        expenses: [],
        otherIncome: [],
        savings: [],
        investments: [],
        funding: [],
        restocks: [],
        damagedGoods: [],
      };
    }

    const sales = raw.sales.filter((sale) => inDateRange(sale.sale_date, from, to));
    const saleIds = new Set(sales.map((sale) => sale.id));

    return {
      sales,
      saleItems: raw.saleItems.filter((item) => saleIds.has(item.sale_id)),
      expenses: raw.expenses.filter((expense) => inDateRange(expense.expense_date, from, to)),
      otherIncome: raw.otherIncome.filter((entry) => inDateRange(entry.income_date, from, to)),
      savings: raw.savings.filter((entry) => inDateRange(entry.savings_date, from, to)),
      investments: raw.investments.filter((entry) => inDateRange(entry.investment_date, from, to)),
      funding: raw.funding.filter((entry) => inDateRange(entry.date_received, from, to)),
      restocks: raw.restocks.filter((entry) => inDateRange(entry.restock_date, from, to)),
      damagedGoods: raw.damagedGoods.filter((entry) => inDateRange(entry.damage_date, from, to)),
    };
  }, [from, invalidRange, raw, to]);

  const recognizedSales = useMemo(
    () => filtered.sales.filter((sale) => isRecognizedSale(sale)),
    [filtered.sales],
  );

  const recognizedSaleIds = useMemo(
    () => new Set(recognizedSales.map((sale) => sale.id)),
    [recognizedSales],
  );

  const recognizedSaleItems = useMemo(
    () => filtered.saleItems.filter((item) => recognizedSaleIds.has(item.sale_id)),
    [filtered.saleItems, recognizedSaleIds],
  );

  const reportStats = useMemo(() => {
    return calculateFinancialSnapshot({
      sales: filtered.sales,
      saleItems: recognizedSaleItems,
      products: raw.products,
      otherIncome: filtered.otherIncome,
      expenses: filtered.expenses,
      savings: filtered.savings,
      investments: filtered.investments,
      investorFunds: filtered.funding,
      restocks: filtered.restocks,
    });
  }, [filtered, raw.products, recognizedSaleItems]);

  const damagedGoodsSummary = useMemo(
    () => calculateDamagedGoodsSummary(filtered.damagedGoods),
    [filtered.damagedGoods],
  );

  const damagedGoodsByProduct = useMemo(
    () => groupDamagedGoodsByProduct(filtered.damagedGoods),
    [filtered.damagedGoods],
  );

  const cumulativeReportFinancials = useMemo(
    () =>
      calculateReportCumulativeFinancials({
        data: raw,
        to,
        openingCashBalance: financials.openingCash,
      }),
    [financials.openingCash, raw, to],
  );

  const usesLiveDashboardMoney = isDefaultLiveDashboardReport({
    year,
    currentYear,
    monthEnabled,
    useCustomRange,
  });

  const reportAvailableBusinessMoney = usesLiveDashboardMoney
    ? financials.availableBusinessMoney
    : cumulativeReportFinancials.availableBusinessMoney;

  const openingStockMovements = useMemo(
    () =>
      raw.stockMovements.filter(
        (movement) => movement.movement_type === 'opening_stock' && inDateRange(movement.movement_date, from, to),
      ),
    [from, raw.stockMovements, to],
  );

  const openingStockValue = useMemo(
    () =>
      openingStockMovements.reduce(
        (sum, movement) => sum + Math.max(0, Number(movement.quantity_change ?? 0)) * Math.max(0, Number(movement.unit_cost ?? 0)),
        0,
      ),
    [openingStockMovements],
  );

  const periodSales = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const weekStart = startOfWeek(new Date());
    const weekEnd = endOfWeek(new Date());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const sumRange = (start: Date, end: Date) =>
      raw.sales.reduce((sum, sale) => {
        const timestamp = new Date(sale.sale_date).getTime();
        if (timestamp < start.getTime() || timestamp > end.getTime() || !isRecognizedSale(sale)) return sum;
        return sum + getPaidAmount(sale);
      }, 0);

    return {
      today: sumRange(todayStart, todayEnd),
      week: sumRange(weekStart, weekEnd),
      month: sumRange(monthStart, monthEnd),
      year: sumRange(yearStart, yearEnd),
    };
  }, [now, raw.sales]);

  const productPerformance = useMemo(() => {
    const grouped = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();
    recognizedSaleItems.forEach((item) => {
      const key = item.product_id || item.product_name || 'unknown';
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unit_price ?? 0);
      const costPrice = Number(item.cost_price ?? 0);
      const existing = grouped.get(key) || { name: item.product_name || 'Unknown product', quantity: 0, revenue: 0, profit: 0 };
      existing.quantity += quantity;
      existing.revenue += quantity * unitPrice;
      existing.profit += quantity * (unitPrice - costPrice);
      grouped.set(key, existing);
    });
    return Array.from(grouped.values()).sort((left, right) => right.revenue - left.revenue);
  }, [recognizedSaleItems]);

  const paymentBreakdown = useMemo(() => {
    const grouped = new Map<string, { method: string; moneyIn: number; moneyOut: number; txCount: number }>();
    const ensure = (method: string) => {
      const existing = grouped.get(method);
      if (existing) return existing;
      const next = { method, moneyIn: 0, moneyOut: 0, txCount: 0 };
      grouped.set(method, next);
      return next;
    };

    recognizedSales.forEach((sale) => {
      const item = ensure(sale.payment_method || 'cash');
      item.moneyIn += getPaidAmount(sale);
      item.txCount += 1;
    });

    filtered.otherIncome.forEach((entry) => {
      const item = ensure(entry.payment_method || 'cash');
      item.moneyIn += Number(entry.amount ?? 0);
      item.txCount += 1;
    });

    filtered.expenses.forEach((expense) => {
      const item = ensure(expense.payment_method || 'cash');
      item.moneyOut += Number(expense.amount ?? 0);
      item.txCount += 1;
    });

    return Array.from(grouped.values()).sort((left, right) => (right.moneyIn - right.moneyOut) - (left.moneyIn - left.moneyOut));
  }, [filtered.expenses, filtered.otherIncome, recognizedSales]);

  const salesReportRows = useMemo(() => {
    const rows = filtered.sales.filter((sale) => salesStockFilter === 'all' || isNegativeStockSale(sale));
    return rows.sort((left, right) => new Date(right.sale_date).getTime() - new Date(left.sale_date).getTime());
  }, [filtered.sales, salesStockFilter]);

  const creditReport = useMemo(() => {
    const grouped = new Map<string, { customerName: string; amountOwed: number; amountPaid: number; balance: number; lastDueDate: string | null; status: string }>();
    filtered.sales.forEach((sale) => {
      const customerName = sale.customer_name || 'Walk-in';
      const amountPaid = Number(sale.amount_paid ?? 0);
      const total = Number(sale.total ?? 0);
      const balance = Number(sale.balance ?? Math.max(0, total - amountPaid));
      if (customerName === 'Walk-in' || balance <= 0) return;
      const existing = grouped.get(customerName) || {
        customerName,
        amountOwed: 0,
        amountPaid: 0,
        balance: 0,
        lastDueDate: null,
        status: 'Unpaid',
      };
      existing.amountOwed += total;
      existing.amountPaid += amountPaid;
      existing.balance += balance;
      existing.lastDueDate = sale.due_date || existing.lastDueDate;
      existing.status = getCreditStatus(sale.payment_status, sale.due_date);
      grouped.set(customerName, existing);
    });
    return Array.from(grouped.values()).sort((left, right) => right.balance - left.balance);
  }, [filtered.sales]);

  const statement = useMemo(
    () =>
      buildReportStatement({
        sales: raw.sales,
        saleItems: raw.saleItems,
        expenses: raw.expenses,
        otherIncome: raw.otherIncome,
        savings: raw.savings,
        investments: raw.investments,
        fundings: raw.funding,
        restocks: raw.restocks,
        products: raw.products,
        openingStockMovements,
        from,
        to,
        openingCashBalance: financials.openingCash,
        availableBusinessMoneyOverride: reportAvailableBusinessMoney,
      }),
    [financials.openingCash, from, openingStockMovements, raw, reportAvailableBusinessMoney, to],
  );

  const yearOptions = useMemo(() => {
    const base = Number(currentYear);
    return Array.from({ length: 6 }, (_, index) => String(base - 4 + index));
  }, [currentYear]);

  const resetToYearOnly = () => {
    setUseCustomRange(false);
    setMonthEnabled(false);
    setMonth(currentMonth);
    setYear(currentYear);
  };

  const handleDownloadSlip = async () => {
    if (invalidRange) {
      toast({ title: 'Fix the date range', description: 'The start date must come before the end date.', variant: 'destructive' });
      return;
    }
    if (statement.rows.length === 0) {
      toast({ title: 'Nothing to export', description: 'There are no transactions in this date range yet.', variant: 'destructive' });
      return;
    }

    setPdfLoading(true);
    try {
      await downloadReportSlipPdf({
        businessName: business?.name || 'KudiTrack Business',
        generatedFor: displayName || user?.email || 'KudiTrack User',
        dateFrom: from,
        dateTo: to,
        rows: statement.rows,
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
        totalMoneyIn: statement.totalMoneyIn,
        totalMoneyOut: statement.totalMoneyOut,
        summary: statement.summary,
      });
    } catch (error: any) {
      toast({
        title: 'Could not generate statement',
        description: error?.message || 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPdfLoading(false);
    }
  };

  // ---- Prior-period comparison (same length, immediately before `from`) ----
  const priorRange = useMemo(() => {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    const length = Math.max(1, end.getTime() - start.getTime());
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - length);
    return {
      from: prevStart.toISOString().slice(0, 10),
      to: prevEnd.toISOString().slice(0, 10),
    };
  }, [from, to]);

  const priorStats = useMemo(() => {
    const inPrior = (v: string | null | undefined) => inDateRange(v, priorRange.from, priorRange.to);
    const sales = raw.sales.filter((s) => inPrior(s.sale_date));
    const saleIds = new Set(sales.map((s) => s.id));
    const saleItems = raw.saleItems.filter((i) => saleIds.has(i.sale_id));
    const rec = sales.filter((s) => isRecognizedSale(s));
    const recIds = new Set(rec.map((s) => s.id));
    const recItems = saleItems.filter((i) => recIds.has(i.sale_id));
    return calculateFinancialSnapshot({
      sales,
      saleItems: recItems,
      products: raw.products,
      otherIncome: raw.otherIncome.filter((e) => inPrior(e.income_date)),
      expenses: raw.expenses.filter((e) => inPrior(e.expense_date)),
      savings: raw.savings.filter((e) => inPrior(e.savings_date)),
      investments: raw.investments.filter((e) => inPrior(e.investment_date)),
      investorFunds: raw.funding.filter((e) => inPrior(e.date_received)),
      restocks: raw.restocks.filter((e) => inPrior(e.restock_date)),
    });
  }, [priorRange, raw]);

  const trend = (current: number, previous: number) => {
    if (!Number.isFinite(previous) || previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  // ---- Active category tab + preview drawer ----
  const [activeCategory, setActiveCategory] = useState<
    'sales' | 'product' | 'inventory' | 'expense' | 'income' | 'financial' | 'savings'
  >('sales');
  const [previewReport, setPreviewReport] = useState<null | {
    title: string;
    description: string;
    metrics: { label: string; value: string; tone?: string }[];
  }>(null);

  // ---- CSV export of statement rows ----
  const handleExportCsv = useCallback(() => {
    if (statement.rows.length === 0) {
      toast({ title: 'Nothing to export', description: 'No transactions in this range.', variant: 'destructive' });
      return;
    }
    const header = ['Date', 'Reference', 'Type', 'Description', 'Money In', 'Money Out', 'Balance'];
    const rows = statement.rows.map((r) => [
      r.date, r.reference, r.type, (r.description || '').replace(/[\r\n]+/g, ' '),
      r.moneyIn.toFixed(2), r.moneyOut.toFixed(2), r.runningBalance.toFixed(2),
    ]);
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kuditrack-statement-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [from, statement.rows, toast, to]);

  const handlePrint = useCallback(() => window.print(), []);

  // ---- Per-category report definitions ----
  const reportCatalog = useMemo(() => ({
    sales: [
      { id: 'sales-summary', title: 'Sales Summary', description: 'Total revenue, paid amounts and counts.', metrics: [
        { label: 'Sales Revenue', value: formatCurrency(reportStats.paidSalesRevenue) },
        { label: 'Total Sales (Count)', value: String(recognizedSales.length) },
        { label: 'Average Sale Value', value: formatCurrency(recognizedSales.length ? reportStats.paidSalesRevenue / recognizedSales.length : 0) },
      ] },
      { id: 'sales-by-product', title: 'Sales by Product', description: 'Top-selling products by revenue.', metrics: productPerformance.slice(0, 5).map((p) => ({ label: p.name, value: formatCurrency(p.revenue) })) },
      { id: 'sales-by-payment', title: 'Sales by Payment Method', description: 'Money in by channel.', metrics: paymentBreakdown.slice(0, 6).map((p) => ({ label: getPaymentMethodLabel(p.method), value: formatCurrency(p.moneyIn) })) },
      { id: 'sales-credit', title: 'Customer Credit', description: 'Outstanding balances by customer.', metrics: creditReport.slice(0, 6).map((c) => ({ label: c.customerName, value: formatCurrency(c.balance), tone: 'text-amber-500' })) },
    ],
    product: [
      { id: 'product-performance', title: 'Product Performance', description: 'Profit by product.', metrics: productPerformance.slice(0, 8).map((p) => ({ label: p.name, value: formatCurrency(p.profit) })) },
    ],
    inventory: [
      { id: 'inventory-valuation', title: 'Inventory Valuation', description: 'Live stock value at cost.', metrics: [
        { label: 'Stock Value (Cost)', value: formatCurrency(financials.stockValue) },
        { label: 'Opening Stock', value: formatCurrency(openingStockValue) },
        { label: 'Restock Spending', value: formatCurrency(reportStats.totalRestockSpending) },
      ] },
      { id: 'inventory-damaged', title: 'Damaged Goods', description: 'Stock losses in this range.', metrics: [
        { label: 'Damaged Quantity', value: String(damagedGoodsSummary.quantity) },
        { label: 'Estimated Loss', value: formatCurrency(damagedGoodsSummary.value), tone: 'text-amber-500' },
        { label: 'Affected Products', value: String(damagedGoodsByProduct.length) },
      ] },
    ],
    expense: [
      { id: 'expense-summary', title: 'Expense Summary', description: 'Total operating expenses in range.', metrics: [
        { label: 'Total Expenses', value: formatCurrency(reportStats.operatingExpenses), tone: 'text-destructive' },
        { label: 'Transactions', value: String(filtered.expenses.length) },
      ] },
    ],
    income: [
      { id: 'income-summary', title: 'Other Income Summary', description: 'Non-sales income in range.', metrics: [
        { label: 'Other Income', value: formatCurrency(filtered.otherIncome.reduce((s, e) => s + Number(e.amount || 0), 0)), tone: 'text-emerald-500' },
        { label: 'Entries', value: String(filtered.otherIncome.length) },
      ] },
    ],
    financial: [
      { id: 'profit-loss', title: 'Profit & Loss', description: 'Revenue minus COGS and expenses.', metrics: [
        { label: 'Revenue', value: formatCurrency(reportStats.paidSalesRevenue) },
        { label: 'COGS', value: formatCurrency(reportStats.cogs) },
        { label: 'Expenses', value: formatCurrency(reportStats.operatingExpenses), tone: 'text-destructive' },
        { label: 'Profit', value: formatCurrency(reportStats.profit), tone: 'text-emerald-500' },
      ] },
      { id: 'cash-flow', title: 'Cash Flow', description: 'Movements of cash in this range.', metrics: [
        { label: 'Money In', value: formatCurrency(statement.totalMoneyIn), tone: 'text-emerald-500' },
        { label: 'Money Out', value: formatCurrency(statement.totalMoneyOut), tone: 'text-destructive' },
        { label: 'Closing Balance', value: formatCurrency(statement.closingBalance) },
      ] },
    ],
    savings: [
      { id: 'savings-summary', title: 'Savings & Investments', description: 'Set-aside business funds.', metrics: [
        { label: 'Savings', value: formatCurrency(filtered.savings.reduce((s, e) => s + Number(e.amount || 0), 0)) },
        { label: 'Investments', value: formatCurrency(filtered.investments.reduce((s, e) => s + Number(e.amount || 0), 0)) },
        { label: 'Investor Funding', value: formatCurrency(filtered.funding.reduce((s, e) => s + Number(e.amount || 0), 0)) },
      ] },
    ],
  }), [creditReport, damagedGoodsByProduct.length, damagedGoodsSummary, filtered, financials.stockValue, openingStockValue, paymentBreakdown, productPerformance, recognizedSales.length, reportStats, statement.closingBalance, statement.totalMoneyIn, statement.totalMoneyOut]);

  const categoryDefs: { value: typeof activeCategory; label: string; icon: any }[] = [
    { value: 'sales', label: 'Sales', icon: ShoppingCart },
    { value: 'product', label: 'Product Performance', icon: Tag },
    { value: 'inventory', label: 'Inventory', icon: Boxes },
    { value: 'expense', label: 'Expenses', icon: Receipt },
    { value: 'income', label: 'Other Income', icon: Coins },
    { value: 'financial', label: 'Financial', icon: Wallet },
    { value: 'savings', label: 'Savings', icon: PiggyBank },
  ];

  const kpiCards = [
    { label: 'Available Business Money', icon: Wallet, accent: 'from-emerald-500/25 to-emerald-500/0', iconClass: 'text-emerald-400 bg-emerald-500/10',
      value: financialsLoading ? '—' : formatCurrency(reportAvailableBusinessMoney), delta: trend(reportAvailableBusinessMoney, financials.availableBusinessMoney) },
    { label: 'Sales Revenue', icon: ShoppingCart, accent: 'from-sky-500/25 to-sky-500/0', iconClass: 'text-sky-400 bg-sky-500/10',
      value: formatCurrency(reportStats.paidSalesRevenue), delta: trend(reportStats.paidSalesRevenue, priorStats.paidSalesRevenue) },
    { label: 'Profit', icon: TrendingUp, accent: 'from-emerald-500/25 to-emerald-500/0', iconClass: 'text-emerald-400 bg-emerald-500/10',
      value: formatCurrency(reportStats.profit), delta: trend(reportStats.profit, priorStats.profit) },
    { label: 'Expenses', icon: Receipt, accent: 'from-rose-500/25 to-rose-500/0', iconClass: 'text-rose-400 bg-rose-500/10',
      value: formatCurrency(reportStats.operatingExpenses), delta: trend(reportStats.operatingExpenses, priorStats.operatingExpenses), invertDeltaColor: true },
    { label: 'COGS', icon: Calculator, accent: 'from-amber-500/25 to-amber-500/0', iconClass: 'text-amber-400 bg-amber-500/10',
      value: formatCurrency(reportStats.cogs), delta: trend(reportStats.cogs, priorStats.cogs), invertDeltaColor: true },
    { label: 'Inventory Value', icon: Boxes, accent: 'from-violet-500/25 to-violet-500/0', iconClass: 'text-violet-400 bg-violet-500/10',
      value: financialsLoading ? '—' : formatCurrency(financials.stockValue), delta: 0 },
  ];

  return (
    <AppLayout title="Reports">
      <div className="space-y-6">
        {/* ---------- EXECUTIVE HEADER ---------- */}
        <section className="sticky top-0 z-20 -mx-4 px-4 py-4 sm:-mx-6 sm:px-6 backdrop-blur-xl bg-background/70 border-b border-border/50">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-primary/15 p-2"><BarChart3 className="h-5 w-5 text-primary" /></div>
                <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
              </div>
              <p className="text-sm text-muted-foreground">Track your business performance and make data-driven decisions.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-[110px] rounded-xl bg-card/60 border-border/60"><SelectValue /></SelectTrigger>
                <SelectContent>{yearOptions.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>

              {monthEnabled && (
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-[140px] rounded-xl bg-card/60 border-border/60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => {
                      const v = String(i + 1).padStart(2, '0');
                      return <SelectItem key={v} value={v}>{new Date(2026, i, 1).toLocaleString('en-GH', { month: 'long' })}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              )}

              {!useCustomRange && (
                <Button variant="outline" className="rounded-xl bg-card/60 border-border/60" onClick={() => setMonthEnabled((v) => !v)}>
                  {monthEnabled ? 'Year only' : 'Add month'}
                </Button>
              )}

              <Button variant={useCustomRange ? 'secondary' : 'outline'} className="rounded-xl" onClick={() => setUseCustomRange((v) => !v)}>
                <CalendarRange className="mr-2 h-4 w-4" /> Custom range
              </Button>

              <Button variant="ghost" className="rounded-xl" onClick={resetToYearOnly}>
                <FilterX className="mr-2 h-4 w-4" /> Reset
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20">
                    <Download className="mr-2 h-4 w-4" /> Export <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => void handleDownloadSlip()} disabled={pdfLoading}>
                    <FileText className="mr-2 h-4 w-4" /> {pdfLoading ? 'Generating…' : 'PDF'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportCsv}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {useCustomRange && (
            <div className="mt-4 grid gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Start date</Label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End date</Label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </div>
          )}
          {invalidRange && <p className="mt-2 text-sm text-destructive">Start date must be before end date.</p>}
        </section>

        {/* ---------- KPI OVERVIEW ---------- */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {kpiCards.map((k, idx) => (
            <KpiCard key={k.label} index={idx} {...k} />
          ))}
        </div>

        {/* ---------- ANALYTICS TREND CHARTS ---------- */}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <TrendCard
            title="Sales Trend" value={formatCurrency(reportStats.paidSalesRevenue)}
            delta={trend(reportStats.paidSalesRevenue, priorStats.paidSalesRevenue)}
            color="hsl(142 70% 50%)" gradId="g-sales"
            data={buildDailySeries(from, to, (k) => {
              const s = filtered.sales.find((x) => x.sale_date?.slice(0, 10) === k);
              return s ? getPaidAmount(s) : 0;
            })}
          />
          <TrendCard
            title="Profit Trend" value={formatCurrency(reportStats.profit)}
            delta={trend(reportStats.profit, priorStats.profit)}
            color="hsl(200 80% 55%)" gradId="g-profit"
            data={buildProfitSeries(from, to, filtered.sales, recognizedSaleItems)}
          />
          <TrendCard
            title="Expense Trend" value={formatCurrency(reportStats.operatingExpenses)}
            delta={trend(reportStats.operatingExpenses, priorStats.operatingExpenses)}
            color="hsl(0 72% 55%)" gradId="g-exp" invertDelta
            data={buildDailySeries(from, to, (k) => filtered.expenses.filter((e) => e.expense_date?.slice(0, 10) === k).reduce((s, e) => s + Number(e.amount || 0), 0))}
          />
        </div>

        {/* ---------- CATEGORY TABS ---------- */}
        <Card className="rounded-2xl border-border/60 bg-card/60">
          <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as any)}>
            <div className="overflow-x-auto p-2">
              <TabsList className="bg-transparent gap-1 h-auto p-0">
                {categoryDefs.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger key={value} value={value}
                    className="rounded-xl px-4 py-2.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none flex items-center gap-2">
                    <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {categoryDefs.map(({ value }) => (
              <TabsContent key={value} value={value} className="p-4 sm:p-5 pt-2">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {reportCatalog[value].map((r) => (
                    <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                      <Card className="group h-full rounded-2xl border-border/60 bg-gradient-to-br from-card to-card/60 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-base">{r.title}</CardTitle>
                              <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>
                            </div>
                            <Button size="icon" variant="ghost" className="rounded-lg opacity-70 group-hover:opacity-100"
                              onClick={() => setPreviewReport({ title: r.title, description: r.description, metrics: r.metrics })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2 pb-4">
                          {r.metrics.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No data in this range.</p>
                          ) : r.metrics.slice(0, 3).map((m, i) => (
                            <div key={i} className="flex items-center justify-between border-t border-border/40 pt-2 first:border-0 first:pt-0">
                              <span className="text-xs text-muted-foreground truncate pr-2">{m.label}</span>
                              <span className={`text-sm font-semibold tabular-nums ${m.tone || ''}`}>{m.value}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </Card>

        {/* ---------- DYNAMIC INTERACTIVE CHART ---------- */}
        <DynamicLineChart
          from={from}
          to={to}
          sales={filtered.sales}
          saleItems={filtered.saleItems}
          otherIncome={filtered.otherIncome}
          expenses={filtered.expenses}
          restocks={filtered.restocks}
          products={raw.products}
        />

        {/* ---------- DAMAGED GOODS ---------- */}
        <Card className="overflow-hidden rounded-2xl border-amber-500/20 bg-card/60">
          <CardHeader className="border-b border-border/40 bg-gradient-to-r from-amber-500/5 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageSearch className="h-4 w-4 text-amber-500" /> Damaged Goods Report
                </CardTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">Inventory loss from damaged goods. Not revenue, profit, or cash movement.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <ReportMetric label="Damaged Quantity" value={String(damagedGoodsSummary.quantity)} />
              <ReportMetric label="Estimated Loss" value={formatCurrency(damagedGoodsSummary.value)} tone="text-amber-500" />
              <ReportMetric label="Affected Products" value={String(damagedGoodsByProduct.length)} />
            </div>

            {damagedGoodsByProduct.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Total Damaged</TableHead><TableHead className="text-right">Estimated Value</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {damagedGoodsByProduct.map((entry) => (
                      <TableRow key={entry.productId}>
                        <TableCell className="font-medium">{entry.productName}</TableCell>
                        <TableCell>{entry.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(entry.value)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {filtered.damagedGoods.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <div className="max-h-[360px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>Date</TableHead><TableHead>Product</TableHead><TableHead>Qty</TableHead>
                        <TableHead>Reason</TableHead><TableHead>Recorded By</TableHead><TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.damagedGoods.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{new Date(entry.damage_date).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell className="font-medium">{entry.product_name || 'Unknown product'}</TableCell>
                          <TableCell>{entry.quantity}</TableCell>
                          <TableCell>{entry.reason || '—'}</TableCell>
                          <TableCell>{entry.recorded_by_name || '—'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(getDamagedGoodsValue(entry))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <EmptyState icon={<PackageSearch className="h-7 w-7 text-muted-foreground" />} title="No damaged goods in this range"
                description="Record damaged goods from Inventory to see stock-loss reporting here." />
            )}
          </CardContent>
        </Card>

        {/* ---------- STATEMENT DATA GRID ---------- */}
        <Card className="overflow-hidden rounded-2xl border-border/60 bg-card/60">
          <CardHeader className="border-b border-border/40 bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><ScrollText className="h-4 w-4 text-primary" /> Recent Transactions</CardTitle>
                <p className="mt-1.5 text-sm text-muted-foreground">A complete ledger of money in and out for this report range.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={handleExportCsv} disabled={statement.rows.length === 0}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
                </Button>
                <Button className="rounded-xl bg-gradient-to-br from-primary to-primary/80" onClick={() => void handleDownloadSlip()} disabled={invalidRange || statement.rows.length === 0 || pdfLoading}>
                  <Download className="mr-2 h-4 w-4" /> {pdfLoading ? 'Generating…' : 'PDF Statement'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ReportMetric label="Opening Balance" value={formatCurrency(statement.openingBalance)} />
              <ReportMetric label="Money In" value={formatCurrency(statement.totalMoneyIn)} tone="text-emerald-500" />
              <ReportMetric label="Money Out" value={formatCurrency(statement.totalMoneyOut)} tone="text-destructive" />
              <ReportMetric label="Closing Balance" value={formatCurrency(statement.closingBalance)} />
            </div>

            {statement.rows.length === 0 ? (
              <EmptyState icon={<FileText className="h-7 w-7 text-muted-foreground" />} title="No transactions in this range"
                description="Change the report filters to preview a statement before downloading." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60">
                <div className="max-h-[480px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Type</TableHead>
                        <TableHead>Description</TableHead><TableHead className="text-right">In</TableHead>
                        <TableHead className="text-right">Out</TableHead><TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statement.rows.map((row) => (
                        <TableRow key={`${row.reference}-${row.date}`}>
                          <TableCell className="whitespace-nowrap">{new Date(row.date).toLocaleDateString('en-GH')}</TableCell>
                          <TableCell className="font-medium">{row.reference}</TableCell>
                          <TableCell><Badge variant="outline" className="rounded-md font-normal">{row.type}</Badge></TableCell>
                          <TableCell className="max-w-[280px] whitespace-normal text-muted-foreground">{row.description}</TableCell>
                          <TableCell className="text-right text-emerald-500 tabular-nums">{row.moneyIn > 0 ? formatCurrency(row.moneyIn) : '—'}</TableCell>
                          <TableCell className="text-right text-destructive tabular-nums">{row.moneyOut > 0 ? formatCurrency(row.moneyOut) : '—'}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(row.runningBalance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ---------- REPORT PREVIEW DRAWER ---------- */}
      <Sheet open={!!previewReport} onOpenChange={(o) => !o && setPreviewReport(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{previewReport?.title}</SheetTitle>
            <SheetDescription>{previewReport?.description}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {previewReport?.metrics.map((m, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 px-4 py-3">
                <span className="text-sm text-muted-foreground">{m.label}</span>
                <span className={`text-base font-semibold tabular-nums ${m.tone || ''}`}>{m.value}</span>
              </div>
            ))}
            {previewReport && previewReport.metrics.length === 0 && (
              <p className="text-sm text-muted-foreground">No data in this range.</p>
            )}
          </div>
          <div className="mt-6 flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={handleExportCsv}><FileSpreadsheet className="mr-2 h-4 w-4" /> CSV</Button>
            <Button className="flex-1 rounded-xl bg-gradient-to-br from-primary to-primary/80" onClick={() => void handleDownloadSlip()} disabled={pdfLoading}>
              <Download className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}

// ===================== Helpers & sub-components =====================

function buildDailySeries(from: string, to: string, getValue: (key: string) => number) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const out: { date: string; value: number }[] = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 1500) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ date: key.slice(5), value: getValue(key) });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return out;
}

function buildProfitSeries(from: string, to: string, sales: any[], items: any[]) {
  const saleById = new Map(sales.map((s) => [s.id, s]));
  const map = new Map<string, number>();
  items.forEach((it) => {
    const sale = saleById.get(it.sale_id);
    if (!sale) return;
    const key = String(sale.sale_date || '').slice(0, 10);
    if (!key) return;
    const qty = Number(it.quantity || 0);
    const profit = qty * (Number(it.unit_price || 0) - Number(it.cost_price || 0));
    map.set(key, (map.get(key) || 0) + profit);
  });
  return buildDailySeries(from, to, (k) => map.get(k) || 0);
}

function ReportMetric({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function KpiCard({
  label, icon: Icon, value, delta, accent, iconClass, invertDeltaColor, index,
}: {
  label: string; icon: any; value: string; delta: number;
  accent: string; iconClass: string; invertDeltaColor?: boolean; index: number;
}) {
  const up = delta >= 0;
  const positive = invertDeltaColor ? !up : up;
  const deltaColor = delta === 0 ? 'text-muted-foreground' : positive ? 'text-emerald-500' : 'text-rose-500';
  const Arrow = delta === 0 ? null : up ? ArrowUpRight : ArrowDownRight;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.05 }}>
      <Card className={`relative overflow-hidden rounded-2xl border-border/60 bg-gradient-to-br ${accent} transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/5`}>
        <div className="absolute inset-0 bg-card/60 backdrop-blur-sm" />
        <CardContent className="relative p-4">
          <div className="flex items-start justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            {Arrow && (
              <div className={`flex items-center gap-0.5 text-xs font-medium ${deltaColor}`}>
                <Arrow className="h-3.5 w-3.5" /> {Math.abs(delta).toFixed(1)}%
              </div>
            )}
          </div>
          <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">vs prior period</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TrendCard({
  title, value, delta, data, color, gradId, invertDelta,
}: {
  title: string; value: string; delta: number; data: { date: string; value: number }[];
  color: string; gradId: string; invertDelta?: boolean;
}) {
  const up = delta >= 0;
  const positive = invertDelta ? !up : up;
  const deltaColor = delta === 0 ? 'text-muted-foreground' : positive ? 'text-emerald-500' : 'text-rose-500';
  const Arrow = delta === 0 ? null : up ? ArrowUpRight : ArrowDownRight;
  // Lazy-load recharts pieces
  const Recharts = require('recharts');
  const { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } = Recharts;

  return (
    <Card className="rounded-2xl border-border/60 bg-card/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {Arrow && (
            <div className={`flex items-center gap-0.5 text-xs font-medium ${deltaColor}`}>
              <Arrow className="h-3.5 w-3.5" /> {Math.abs(delta).toFixed(1)}%
            </div>
          )}
        </div>
        <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} opacity={0.4} />
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
                formatter={(v: any) => formatCurrency(Number(v))}
              />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

