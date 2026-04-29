import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { trialDaysLeft, isTrialActive } from "@/lib/trial";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  Plus, Package, Receipt, TrendingUp, Boxes, Wallet, ShoppingBag,
  LogOut, Sparkles, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AddProductDialog, AddSaleDialog, AddExpenseDialog } from "@/components/dashboard/Dialogs";
import { SalesChart, type Point } from "@/components/dashboard/SalesChart";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SikaFlow" }] }),
  component: DashboardPage,
});

type Profile = { business_name: string | null; trial_end_date: string; onboarding_completed: boolean };
type Product = { id: string; name: string; price: number; cost: number; stock: number; low_stock_threshold: number; created_at: string };
type Sale = { id: string; total: number; cost_total: number; payment_method: string; customer_name: string | null; sale_date: string };
type Expense = { id: string; amount: number; category: string; note: string | null; expense_date: string };

function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openSale, setOpenSale] = useState(false);
  const [openProduct, setOpenProduct] = useState(false);
  const [openExpense, setOpenExpense] = useState(false);

  const loadAll = useCallback(async (uid: string) => {
    const [{ data: prods }, { data: sls }, { data: exps }] = await Promise.all([
      supabase.from("products").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("sales").select("*").eq("user_id", uid).order("sale_date", { ascending: false }).limit(200),
      supabase.from("expenses").select("*").eq("user_id", uid).order("expense_date", { ascending: false }).limit(200),
    ]);
    setProducts((prods as Product[]) ?? []);
    setSales((sls as Sale[]) ?? []);
    setExpenses((exps as Expense[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("business_name, trial_end_date, onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (!data) {
        // Defensive: profile didn't auto-create — make a minimal one and send to onboarding
        await supabase.from("profiles").upsert({ id: user.id, email: user.email }, { onConflict: "id" });
        navigate({ to: "/onboarding" });
        return;
      }
      if (!data.onboarding_completed) { navigate({ to: "/onboarding" }); return; }
      setProfile(data as Profile);
      loadAll(user.id);
    })();
  }, [user, loading, navigate, loadAll]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dash-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `user_id=eq.${user.id}` }, () => loadAll(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${user.id}` }, () => loadAll(user.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${user.id}` }, () => loadAll(user.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, loadAll]);

  // Derived stats
  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todaysSales = sales.filter((s) => new Date(s.sale_date) >= today);
    const dailySales = todaysSales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);
    const totalCost = sales.reduce((sum, s) => sum + Number(s.cost_total), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const profit = totalRevenue - totalCost - totalExpenses;
    const cashAvailable = totalRevenue - totalExpenses;
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

    return { dailySales, totalRevenue, profit, cashAvailable, stockValue, stockUnits, totalExpenses, series, todaysCount: todaysSales.length };
  }, [sales, products, expenses]);

  if (loading || !loaded || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const trialActive = isTrialActive(profile.trial_end_date);
  const daysLeft = trialDaysLeft(profile.trial_end_date);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            {trialActive ? (
              <span className="hidden items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary sm:inline-flex">
                <Sparkles className="h-3.5 w-3.5" />
                Trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>
            ) : (
              <span className="hidden items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-xs font-medium text-warning-foreground sm:inline-flex">
                <AlertTriangle className="h-3.5 w-3.5" /> Trial ended
              </span>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>
              <LogOut className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="animate-fade-up">
          <p className="text-sm text-muted-foreground">{getGreeting()},</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {profile.business_name || "Your business"}
            </h1>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setOpenSale(true)} className="bg-primary hover:bg-primary/90">
                <Plus className="mr-1 h-4 w-4" /> Add Sale
              </Button>
              <Button onClick={() => setOpenProduct(true)} variant="outline">
                <Package className="mr-1 h-4 w-4" /> Add Product
              </Button>
              <Button onClick={() => setOpenExpense(true)} variant="outline">
                <Receipt className="mr-1 h-4 w-4" /> Expense
              </Button>
            </div>
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

        {/* Stat cards */}
        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Wallet}
            label="Available Money"
            value={formatCurrency(stats.cashAvailable)}
            hint="Revenue − Expenses"
            tone="primary"
          />
          <StatCard
            icon={ShoppingBag}
            label="Daily Sales"
            value={formatCurrency(stats.dailySales)}
            hint={`${stats.todaysCount} ${stats.todaysCount === 1 ? "sale" : "sales"} today`}
          />
          <StatCard
            icon={TrendingUp}
            label="Total Profit"
            value={formatCurrency(stats.profit)}
            hint="Revenue − Cost − Expenses"
            trend={stats.profit >= 0 ? "up" : "down"}
          />
          <StatCard
            icon={Boxes}
            label="Stock Left"
            value={`${formatNumber(stats.stockUnits)} units`}
            hint={`Worth ${formatCurrency(stats.stockValue)}`}
          />
        </section>

        {/* Chart + recent transactions */}
        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SalesChart data={stats.series} />
          </div>
          <RecentTransactions sales={sales} expenses={expenses} />
        </section>

        {/* Products section */}
        <section className="mt-6">
          <ProductsTable products={products} onAdd={() => setOpenProduct(true)} onChange={() => user && loadAll(user.id)} />
        </section>
      </main>

      <AddSaleDialog open={openSale} onOpenChange={setOpenSale} />
      <AddProductDialog open={openProduct} onOpenChange={setOpenProduct} />
      <AddExpenseDialog open={openExpense} onOpenChange={setOpenExpense} />
    </div>
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

function RecentTransactions({ sales, expenses }: { sales: Sale[]; expenses: Expense[] }) {
  const items = useMemo(() => {
    const sIt = sales.map((s) => ({ kind: "sale" as const, id: s.id, amount: Number(s.total), label: s.customer_name || s.payment_method.replace("_", " "), date: s.sale_date }));
    const eIt = expenses.map((e) => ({ kind: "expense" as const, id: e.id, amount: Number(e.amount), label: e.category, date: e.expense_date }));
    return [...sIt, ...eIt].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8);
  }, [sales, expenses]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold">Recent transactions</h3>
      <p className="text-xs text-muted-foreground">Latest sales and expenses</p>
      {items.length === 0 ? (
        <p className="mt-6 rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
          No transactions yet. Record your first sale to see it here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  it.kind === "sale" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                }`}>
                  {it.kind === "sale" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium capitalize">{it.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(it.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {new Date(it.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
              <span className={`text-sm font-semibold ${it.kind === "sale" ? "text-success" : "text-destructive"}`}>
                {it.kind === "sale" ? "+" : "−"}{formatCurrency(it.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductsTable({ products, onAdd, onChange }: { products: Product[]; onAdd: () => void; onChange: () => void }) {
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
                    <td className="px-2 py-3">{formatCurrency(Number(p.price))}</td>
                    <td className="px-2 py-3 text-muted-foreground">{formatCurrency(Number(p.cost))}</td>
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
