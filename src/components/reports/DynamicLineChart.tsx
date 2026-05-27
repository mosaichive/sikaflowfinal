import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart as LineChartIcon } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { getPaidAmount, isRecognizedSale } from '@/lib/sales-inventory';

type ReportKey = 'sales' | 'product' | 'other_income' | 'expenses' | 'inventory';

const REPORTS: { value: ReportKey; label: string }[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'product', label: 'Product Performance' },
  { value: 'other_income', label: 'Other Income' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'inventory', label: 'Inventory Value' },
];

type Props = {
  from: string;
  to: string;
  sales: any[];
  saleItems: any[];
  otherIncome: any[];
  expenses: any[];
  restocks: any[];
  products: any[];
};

function dayKey(value: string | null | undefined) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function buildDailySeries(from: string, to: string, getEntries: (key: string) => number) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const result: { date: string; value: number }[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({ date: key.slice(5), value: getEntries(key) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export function DynamicLineChart({ from, to, sales, saleItems, otherIncome, expenses, restocks, products }: Props) {
  const [report, setReport] = useState<ReportKey>('sales');

  const data = useMemo(() => {
    if (report === 'sales') {
      const map = new Map<string, number>();
      sales.forEach((s) => {
        if (!isRecognizedSale(s)) return;
        const k = dayKey(s.sale_date);
        map.set(k, (map.get(k) || 0) + getPaidAmount(s));
      });
      return buildDailySeries(from, to, (k) => map.get(k) || 0);
    }
    if (report === 'product') {
      const map = new Map<string, number>();
      const saleById = new Map(sales.map((s) => [s.id, s]));
      saleItems.forEach((item) => {
        const sale = saleById.get(item.sale_id);
        if (!sale || !isRecognizedSale(sale)) return;
        const k = dayKey(sale.sale_date);
        const qty = Number(item.quantity || 0);
        const profit = qty * (Number(item.unit_price || 0) - Number(item.cost_price || 0));
        map.set(k, (map.get(k) || 0) + profit);
      });
      return buildDailySeries(from, to, (k) => map.get(k) || 0);
    }
    if (report === 'other_income') {
      const map = new Map<string, number>();
      otherIncome.forEach((e) => {
        const k = dayKey(e.income_date);
        map.set(k, (map.get(k) || 0) + Number(e.amount || 0));
      });
      return buildDailySeries(from, to, (k) => map.get(k) || 0);
    }
    if (report === 'expenses') {
      const map = new Map<string, number>();
      expenses.forEach((e) => {
        const k = dayKey(e.expense_date);
        map.set(k, (map.get(k) || 0) + Number(e.amount || 0));
      });
      return buildDailySeries(from, to, (k) => map.get(k) || 0);
    }
    // inventory value (restock spend per day)
    const map = new Map<string, number>();
    restocks.forEach((r) => {
      if (r.status === 'cancelled' || r.is_opening_stock) return;
      const k = dayKey(r.restock_date);
      map.set(k, (map.get(k) || 0) + Number(r.total_cost || 0));
    });
    return buildDailySeries(from, to, (k) => map.get(k) || 0);
  }, [report, from, to, sales, saleItems, otherIncome, expenses, restocks]);

  const total = data.reduce((s, d) => s + d.value, 0);
  const label = REPORTS.find((r) => r.value === report)?.label || '';

  return (
    <Card className="overflow-hidden border-primary/25">
      <CardHeader className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <LineChartIcon className="h-4 w-4 text-primary" />
            {label} Trend
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Daily {label.toLowerCase()} for the selected period • Total: <span className="font-medium text-foreground">{formatCurrency(total)}</span>
          </p>
        </div>
        <Select value={report} onValueChange={(v) => setReport(v as ReportKey)}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {REPORTS.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={report}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="h-[280px] w-full"
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [formatCurrency(Number(v)), label]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
