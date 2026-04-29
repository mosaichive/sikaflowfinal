import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "./products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateReportPdf } from "@/server/reports.functions";
import { downloadPdfFromServerResult, defaultPdfName } from "@/lib/download";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { DateFilterBar } from "@/components/DateFilterBar";
import { useDateFilter, getRange } from "@/lib/date-filter";

type Sale = { id: string; total: number; cost_total: number; discount: number; payment_method: string; sale_date: string };
type SaleItem = { product_name: string; quantity: number; unit_price: number; unit_cost: number; sale_id: string };
type Expense = { amount: number; category: string; expense_date: string };
type Income = { amount: number; source: string; income_date: string };

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — SikaFlow" }] }),
  component: ReportsPage,
});

type Preset = { key: string; label: string };
const PRESETS: Preset[] = [
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

function rangeFor(preset: string, from: string, to: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: endOfDay(now), label: "Daily report" };
  if (preset === "7") { const f = startOfDay(new Date()); f.setDate(f.getDate() - 6); return { from: f, to: endOfDay(now), label: "Weekly report" }; }
  if (preset === "30") { const f = startOfDay(new Date()); f.setDate(f.getDate() - 29); return { from: f, to: endOfDay(now), label: "Monthly report" }; }
  if (preset === "month") { const f = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)); return { from: f, to: endOfDay(now), label: "This-month report" }; }
  if (preset === "year") { const f = startOfDay(new Date(now.getFullYear(), 0, 1)); return { from: f, to: endOfDay(now), label: "Yearly report" }; }
  const f = from ? startOfDay(new Date(from)) : startOfDay(now);
  const t = to ? endOfDay(new Date(to)) : endOfDay(now);
  return { from: f, to: t, label: "Custom report" };
}

type StockMove = { product_id: string; change: number; reason: string; created_at: string };

function ReportsPage() {
  const { ready, user } = useRequireUser();
  const { filter: dateFilter, setFilter: setDateFilter } = useDateFilter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [movesAll, setMovesAll] = useState<StockMove[]>([]);
  const [downloading, setDownloading] = useState(false);
  const generate = useServerFn(generateReportPdf);

  const range = useMemo(() => {
    const r = getRange(dateFilter);
    const now = new Date();
    const from = r.start ?? new Date(now.getFullYear(), 0, 1);
    const to = r.end ?? new Date(now.getFullYear() + 1, 0, 1);
    let label = "Report";
    if (dateFilter.granularity === "day") label = "Daily report";
    else if (dateFilter.granularity === "month") label = "Monthly report";
    else if (dateFilter.granularity === "year") label = "Yearly report";
    else if (dateFilter.granularity === "custom") label = "Custom report";
    else label = "All-time report";
    return { from, to, label };
  }, [dateFilter]);

  async function load() {
    if (!user) return;
    const fromISO = range.from.toISOString();
    const toISO = range.to.toISOString();
    const [{ data: ss }, { data: ee }, { data: oo }, { data: mm }] = await Promise.all([
      supabase.from("sales").select("id,total,cost_total,discount,payment_method,sale_date").eq("user_id", user.id).gte("sale_date", fromISO).lte("sale_date", toISO).order("sale_date", { ascending: false }),
      supabase.from("expenses").select("amount,category,expense_date").eq("user_id", user.id).gte("expense_date", fromISO).lte("expense_date", toISO),
      supabase.from("other_income").select("amount,source,income_date").eq("user_id", user.id).gte("income_date", fromISO).lte("income_date", toISO),
      supabase.from("stock_movements").select("product_id,change,reason,created_at").eq("user_id", user.id).order("created_at", { ascending: true }),
    ]);
    const salesArr = (ss as Sale[]) ?? [];
    setSales(salesArr);
    setExpenses((ee as Expense[]) ?? []);
    setIncome((oo as Income[]) ?? []);
    setMovesAll((mm as StockMove[]) ?? []);
    if (salesArr.length > 0) {
      const ids = salesArr.map((s) => s.id);
      const { data: ii } = await supabase.from("sale_items").select("product_name,quantity,unit_price,unit_cost,sale_id").in("sale_id", ids);
      setItems((ii as SaleItem[]) ?? []);
    } else {
      setItems([]);
    }
  }

  useEffect(() => { if (ready) load(); /* eslint-disable-next-line */ }, [ready, dateFilter, user?.id]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("reports-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "other_income", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [user?.id, dateFilter]);

  const stats = useMemo(() => {
    const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
    const cost = sales.reduce((s, x) => s + Number(x.cost_total), 0);
    const exp = expenses.reduce((s, x) => s + Number(x.amount), 0);
    const inc = income.reduce((s, x) => s + Number(x.amount), 0);
    const grossProfit = revenue - cost;
    const netProfit = grossProfit - exp + inc;
    const tx = sales.length;
    const avg = tx > 0 ? revenue / tx : 0;

    // build daily series across the range
    const days = Math.min(90, Math.max(1, Math.ceil((range.to.getTime() - range.from.getTime()) / 86400000) + 1));
    const series: { label: string; value: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(range.to); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const v = sales.filter((s) => { const sd = new Date(s.sale_date); return sd >= d && sd < next; })
        .reduce((sum, s) => sum + Number(s.total), 0);
      series.push({ label: days <= 8 ? d.toLocaleDateString(undefined, { weekday: "short" }) : `${d.getMonth() + 1}/${d.getDate()}`, value: Number(v.toFixed(2)) });
    }

    const productMap = new Map<string, { qty: number; revenue: number; profit: number }>();
    for (const it of items) {
      const cur = productMap.get(it.product_name) || { qty: 0, revenue: 0, profit: 0 };
      const qty = Number(it.quantity);
      const rev = qty * Number(it.unit_price);
      const prof = qty * (Number(it.unit_price) - Number(it.unit_cost));
      productMap.set(it.product_name, { qty: cur.qty + qty, revenue: cur.revenue + rev, profit: cur.profit + prof });
    }
    const best = [...productMap.entries()].map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const payMap = new Map<string, number>();
    for (const s of sales) payMap.set(s.payment_method, (payMap.get(s.payment_method) || 0) + Number(s.total));

    return { revenue, cost, exp, inc, grossProfit, netProfit, tx, avg, series, best, pays: [...payMap.entries()] };
  }, [sales, items, expenses, income, range]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await generate({
        data: { fromISO: range.from.toISOString(), toISO: range.to.toISOString(), rangeLabel: range.label },
      });
      console.log("[reports] server response keys:", res ? Object.keys(res) : null);
      downloadPdfFromServerResult(res, defaultPdfName("SikaFlow_Report"));
      toast.success("Report downloaded");
    } catch (e: unknown) {
      console.error("[reports] download failed:", e);
      const msg = e instanceof Error ? e.message : "Failed to generate report. Please try again.";
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageHeader title="Reports" description="Sales, costs, profit and best sellers — exportable as a branded PDF." />
          <Button onClick={downloadPdf} disabled={downloading} className="shrink-0">
            {downloading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Download PDF
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {PRESETS.map((r) => (
            <button key={r.key} onClick={() => setPreset(r.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${preset === r.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"}`}>
              {r.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:max-w-xl">
            <div>
              <Label htmlFor="from">From</Label>
              <Input id="from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <Input id="to" type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
        )}

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Revenue" value={formatCurrency(stats.revenue)} tone="primary" />
          <Stat label="Cost of goods" value={formatCurrency(stats.cost)} />
          <Stat label="Expenses" value={formatCurrency(stats.exp)} />
          <Stat label="Net profit" value={formatCurrency(stats.netProfit)} tone={stats.netProfit >= 0 ? "success" : "danger"} />
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Transactions" value={String(stats.tx)} />
          <Stat label="Average sale" value={formatCurrency(stats.avg)} />
          <Stat label="Other income" value={formatCurrency(stats.inc)} />
          <Stat label="Gross profit" value={formatCurrency(stats.grossProfit)} tone={stats.grossProfit >= 0 ? "success" : "danger"} />
        </div>

        <div className="mb-4">
          <SalesChart data={stats.series} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Top products">
            {stats.best.length === 0 ? (
              <Empty msg="No products sold in this period." />
            ) : (
              <ul className="divide-y divide-border">
                {stats.best.map((b) => (
                  <li key={b.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">Qty {b.qty} · Profit {formatCurrency(b.profit)}</p>
                    </div>
                    <p className="shrink-0 font-semibold">{formatCurrency(b.revenue)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Payment methods">
            {stats.pays.length === 0 ? (
              <Empty msg="No payments in this period." />
            ) : (
              <ul className="divide-y divide-border">
                {stats.pays.map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between py-2 text-sm">
                    <span className="capitalize text-muted-foreground">{k.replace("_", " ")}</span>
                    <span className="font-semibold">{formatCurrency(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "primary" | "success" | "danger" }) {
  const cls = tone === "primary" ? "border-primary/30 bg-primary/5"
    : tone === "success" ? "border-success/30 bg-success/5"
    : tone === "danger" ? "border-destructive/30 bg-destructive/5"
    : "border-border bg-card";
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{msg}</p>;
}
