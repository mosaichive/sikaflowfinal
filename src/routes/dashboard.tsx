import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { trialDaysLeft, isTrialActive } from "@/lib/trial";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  Plus, TrendingUp, Boxes, Wallet, ShoppingBag,
  Sparkles, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AddProductDialog } from "@/components/dashboard/Dialogs";
import { SalesChart, type Point } from "@/components/dashboard/SalesChart";
import { AppShell } from "@/components/nav/AppShell";
import { DateFilterBar } from "@/components/DateFilterBar";
import { useDateFilter, inRange } from "@/lib/date-filter";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SikaFlow" }] }),
  component: DashboardPage,
});

type Profile = { business_name: string | null; trial_end_date: string; onboarding_completed: boolean; currency: string };
type Product = { id: string; name: string; price: number; cost: number; stock: number; low_stock_threshold: number; created_at: string };
type Sale = { id: string; total: number; cost_total: number; payment_method: string; customer_name: string | null; sale_date: string };
type Expense = { id: string; amount: number; category: string; note: string | null; expense_date: string };
type Income = { id: string; amount: number; source: string; income_date: string };
type Saving = { id: string; amount: number; savings_date: string };

function DashboardPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income, setIncome] = useState<Income[]>([]);
  const [savings, setSavings] = useState<Saving[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openProduct, setOpenProduct] = useState(false);
  const { filter, setFilter, range } = useDateFilter();

  const loadAll = useCallback(async (uid: string) => {
    const [{ data: prods }, { data: sls }, { data: exps }, { data: inc }, { data: sav }] = await Promise.all([
      supabase.from("products").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("sales").select("*").eq("user_id", uid).order("sale_date", { ascending: false }).limit(500),
      supabase.from("expenses").select("*").eq("user_id", uid).order("expense_date", { ascending: false }).limit(500),
      supabase.from("other_income").select("*").eq("user_id", uid).order("income_date", { ascending: false }).limit(500),
      supabase.from("savings").select("id,amount,savings_date").eq("user_id", uid).order("savings_date", { ascending: false }).limit(500),
    ]);
    setProducts((prods as Product[]) ?? []);
    setSales((sls as Sale[]) ?? []);
    setExpenses((exps as Expense[]) ?? []);
    setIncome((inc as Income[]) ?? []);
    setSavings((sav as Saving[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("business_name, trial_end_date, onboarding_completed, currency")
        .eq("id", user.id)
        .maybeSingle();
      if (!data) {
        await supabase.from("profiles").upsert({ id: user.id, email: user.email }, { onConflict: "id" });
        navigate({ to: "/onboarding" });
        return;
      }
      if (!data.onboarding_completed) { navigate({ to: "/onboarding" }); return; }
      setProfile(data as Profile);
      loadAll(user.id);
    })();
  }, [user, loading, navigate, loadAll]);

  // Realtime subscriptions (sales, expenses, income, products)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dash-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `user_id=eq.${user.id}` }, () => loadAll(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${user.id}` }, () => loadAll(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${user.id}` }, () => loadAll(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "other_income", filter: `user_id=eq.${user.id}` }, () => loadAll(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "savings", filter: `user_id=eq.${user.id}` }, () => loadAll(user.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadAll]);

  const currency = profile?.currency ?? "GHS";

  // Filtered data
  const fSales = useMemo(() => sales.filter((s) => inRange(s.sale_date, range)), [sales, range]);
  const fExpenses = useMemo(() => expenses.filter((e) => inRange(e.expense_date, range)), [expenses, range]);
  const fIncome = useMemo(() => income.filter((i) => inRange(i.income_date, range)), [income, range]);
  const fSavings = useMemo(() => savings.filter((s) => inRange(s.savings_date, range)), [savings, range]);

  // Derived stats
  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todaysSales = sales.filter((s) => new Date(s.sale_date) >= today);
    const dailySales = todaysSales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalRevenue = fSales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalCost = fSales.reduce((sum, s) => sum + Number(s.cost_total), 0);
    const totalExpenses = fExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalIncome = fIncome.reduce((sum, i) => sum + Number(i.amount), 0);
    const totalSavings = fSavings.reduce((sum, s) => sum + Number(s.amount), 0);
    const profit = totalRevenue - totalCost - totalExpenses + totalIncome;
    // Available Money = Sales + Other Income − Expenses − Savings
    const cashAvailable = totalRevenue + totalIncome - totalExpenses - totalSavings;
    const stockValue = products.reduce((sum, p) => sum + Number(p.price) * Number(p.stock), 0);
    const stockUnits = products.reduce((sum, p) => sum + Number(p.stock), 0);

    // 7 day series
    const series: Point[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      const value = sales
        .filter((s) => { const sd = new Date(s.sale_date); return sd >= d && sd < next; })
        .reduce((sum, s) => sum + Number(s.total), 0);
      series.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), value: Number(value.toFixed(2)) });
    }

    return { dailySales, totalRevenue, profit, cashAvailable, stockValue, stockUnits, totalExpenses, totalIncome, totalSavings, series, todaysCount: todaysSales.length };
  }, [sales, products, fSales, fExpenses, fIncome, fSavings]);

  if (loading || !loaded || !profile) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      </AppShell>
    );
  }

  const trialActive = isTrialActive(profile.trial_end_date);
  const daysLeft = trialDaysLeft(profile.trial_end_date);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {trialActive ? (
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
          </div>
        ) : (
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-xs font-medium text-warning-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Trial ended
          </div>
        )}
        <section className="animate-fade-up">
          <p className="text-sm text-muted-foreground">{getGreeting()},</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {profile.business_name || "Your business"}
            </h1>
          </div>
        </section>

        {!trialActive && (
          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/30 text-warning-foreground">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium">Your free trial has ended</p>
                <p className="text-sm text-muted-foreground">Upgrade to continue using all features.</p>
              </div>
            </div>
            <Button onClick={() => toast.info("Upgrade options coming soon!")} className="bg-primary hover:bg-primary/90">
              Upgrade now
            </Button>
          </div>
        )}

        <div className="mt-6">
          <DateFilterBar filter={filter} onChange={setFilter} allowAll />
        </div>

        {/* Stat cards */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Wallet}
            label="Available Money"
            value={formatCurrency(stats.cashAvailable, currency)}
            hint="Sales + Other Income − Expenses − Savings"
            tone="primary"
          />
          <StatCard
            icon={ShoppingBag}
            label="Daily Sales"
            value={formatCurrency(stats.dailySales, currency)}
            hint={`${stats.todaysCount} ${stats.todaysCount === 1 ? "sale" : "sales"} today`}
          />
          <StatCard
            icon={TrendingUp}
            label="Total Profit"
            value={formatCurrency(stats.profit, currency)}
            hint="Revenue − Cost − Expenses + Income"
            trend={stats.profit >= 0 ? "up" : "down"}
          />
          <StatCard
            icon={Boxes}
            label="Stock Left"
            value={`${formatNumber(stats.stockUnits)} units`}
            hint={`Worth ${formatCurrency(stats.stockValue, currency)}`}
          />
        </section>

        {/* Chart + recent transactions */}
        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SalesChart data={stats.series} />
          </div>
          <RecentTransactions sales={fSales} expenses={fExpenses} income={fIncome} currency={currency} />
        </section>

        {/* Products section */}
        <section className="mt-6">
          <ProductsTable products={products} currency={currency} onAdd={() => setOpenProduct(true)} onChange={() => user && loadAll(user.id)} />
        </section>
      </div>

      <AddProductDialog open={openProduct} onOpenChange={setOpenProduct} />
    </AppShell>
  );
}

function StatCard({
  icon: Icon, label, value, hint, tone, trend,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; hint?: string;
  tone?: "primary"; trend?: "up" | "down";
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elegant ${
      tone === "primary" ? "border-primary/30 bg-gradient-to-br from-primary/5 to-transparent" : "border-border bg-card"
    }`}>
      <div className="flex items-center justify-between">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
          tone === "primary" ? "bg-primary text-primary-foreground" : "bg-accent text-primary"
        }`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend === "up" ? "text-success" : "text-destructive"}`}>
            {trend === "up" ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          </span>
        )}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RecentTransactions({ sales, expenses, income, currency }: { sales: Sale[]; expenses: Expense[]; income: Income[]; currency: string }) {
  const items = useMemo(() => {
    const sIt = sales.map((s) => ({ kind: "sale" as const, id: s.id, amount: Number(s.total), label: s.customer_name || s.payment_method.replace("_", " "), date: s.sale_date }));
    const eIt = expenses.map((e) => ({ kind: "expense" as const, id: e.id, amount: Number(e.amount), label: e.category, date: e.expense_date }));
    const iIt = income.map((i) => ({ kind: "income" as const, id: i.id, amount: Number(i.amount), label: i.source, date: i.income_date }));
    return [...sIt, ...eIt, ...iIt].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8);
  }, [sales, expenses, income]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold">Recent transactions</h3>
      <p className="text-xs text-muted-foreground">Latest sales, income and expenses</p>
      {items.length === 0 ? (
        <p className="mt-6 rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
          Nothing in this date range yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((it) => {
            const positive = it.kind !== "expense";
            return (
              <li key={`${it.kind}-${it.id}`} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    positive ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                  }`}>
                    {positive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium capitalize">{it.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.kind} · {new Date(it.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${positive ? "text-success" : "text-destructive"}`}>
                  {positive ? "+" : "−"}{formatCurrency(it.amount, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProductsTable({ products, currency, onAdd, onChange }: { products: Product[]; currency: string; onAdd: () => void; onChange: () => void }) {
  async function remove(id: string) {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Product deleted");
    onChange();
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Products</h3>
          <p className="text-xs text-muted-foreground">{products.length} {products.length === 1 ? "product" : "products"} in your inventory</p>
        </div>
        <Button size="sm" onClick={onAdd} className="bg-primary hover:bg-primary/90">
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {products.length === 0 ? (
        <p className="mt-6 rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
          No products yet. Add your first product to start tallying sales.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 font-medium">Product</th>
                <th className="px-2 py-2 font-medium">Price</th>
                <th className="px-2 py-2 font-medium">Cost</th>
                <th className="px-2 py-2 font-medium">Stock</th>
                <th className="px-2 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const low = Number(p.stock) <= Number(p.low_stock_threshold);
                return (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-3 font-medium">{p.name}</td>
                    <td className="px-2 py-3">{formatCurrency(Number(p.price), currency)}</td>
                    <td className="px-2 py-3 text-muted-foreground">{formatCurrency(Number(p.cost), currency)}</td>
                    <td className="px-2 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        low ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {formatNumber(Number(p.stock))}{low && " · low"}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
