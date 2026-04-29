import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { SalesChart } from "@/components/dashboard/SalesChart";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "./products";

type Sale = { total: number; cost_total: number; sale_date: string };
type Expense = { amount: number; expense_date: string };

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — SikaFlow" }] }),
  component: ReportsPage,
});

const RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
];

function ReportsPage() {
  const { ready, user } = useRequireUser();
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [range, setRange] = useState(RANGES[1]);

  async function load() {
    if (!user) return;
    const since = new Date(); since.setDate(since.getDate() - range.days);
    const [{ data: ss }, { data: ee }] = await Promise.all([
      supabase.from("sales").select("total,cost_total,sale_date").eq("user_id", user.id).gte("sale_date", since.toISOString()),
      supabase.from("expenses").select("amount,expense_date").eq("user_id", user.id).gte("expense_date", since.toISOString()),
    ]);
    setSales((ss as Sale[]) ?? []);
    setExpenses((ee as Expense[]) ?? []);
  }
  useEffect(() => { if (ready) load(); }, [ready, range]); // eslint-disable-line

  const stats = useMemo(() => {
    const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
    const cost = sales.reduce((s, x) => s + Number(x.cost_total), 0);
    const exp = expenses.reduce((s, x) => s + Number(x.amount), 0);
    const profit = revenue - cost - exp;

    const series: { label: string; value: number }[] = [];
    for (let i = range.days - 1; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const v = sales.filter((s) => { const sd = new Date(s.sale_date); return sd >= d && sd < next; })
        .reduce((sum, s) => sum + Number(s.total), 0);
      series.push({ label: range.days <= 7 ? d.toLocaleDateString(undefined, { weekday: "short" }) : `${d.getMonth() + 1}/${d.getDate()}`, value: Number(v.toFixed(2)) });
    }
    return { revenue, cost, exp, profit, series };
  }, [sales, expenses, range]);

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Reports" description="Visualise sales, costs and profit over time." />
        <div className="mb-4 flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r)} className={`rounded-full border px-3 py-1 text-xs font-medium ${range.key === r.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Revenue" value={formatCurrency(stats.revenue)} tone="primary" />
          <Stat label="Cost of goods" value={formatCurrency(stats.cost)} />
          <Stat label="Expenses" value={formatCurrency(stats.exp)} />
          <Stat label="Profit" value={formatCurrency(stats.profit)} tone={stats.profit >= 0 ? "success" : "danger"} />
        </div>
        <SalesChart data={stats.series} />
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
