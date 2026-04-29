import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Minus, ShoppingCart, Trash2, Search } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "./products";

type Product = { id: string; name: string; price: number; cost: number; stock: number };
type CartLine = { product: Product; qty: number };
type Customer = { id: string; name: string };

export const Route = createFileRoute("/sales")({
  head: () => ({ meta: [{ title: "Sales / POS — SikaFlow" }] }),
  component: SalesPage,
});

function SalesPage() {
  const { ready, user } = useRequireUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("products").select("id,name,price,cost,stock").eq("user_id", user.id).order("name")
      .then(({ data }) => setProducts((data as Product[]) ?? []));
    supabase.from("customers").select("id,name").eq("user_id", user.id).order("name")
      .then(({ data }) => setCustomers((data as Customer[]) ?? []));
  }, [ready, user]);

  const filtered = products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + l.qty * Number(l.product.price), 0);
    const items = cart.reduce((s, l) => s + l.qty, 0);
    return { subtotal, items };
  }, [cart]);

  function addToCart(p: Product) {
    setCart((c) => {
      const idx = c.findIndex((l) => l.product.id === p.id);
      if (idx >= 0) { const next = [...c]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next; }
      return [...c, { product: p, qty: 1 }];
    });
  }
  function setQty(id: string, qty: number) {
    if (qty <= 0) return setCart((c) => c.filter((l) => l.product.id !== id));
    setCart((c) => c.map((l) => l.product.id === id ? { ...l, qty } : l));
  }

  async function checkout() {
    if (!user || cart.length === 0) return;
    setSaving(true);
    const total = totals.subtotal;
    const costTotal = cart.reduce((s, l) => s + l.qty * Number(l.product.cost ?? 0), 0);
    const cust = customerId ? customers.find((c) => c.id === customerId) : null;
    const { data: sale, error } = await supabase.from("sales").insert({
      user_id: user.id, total, cost_total: costTotal,
      payment_method: paymentMethod,
      customer_id: customerId || null,
      customer_name: cust?.name ?? (customerName.trim() || null),
    }).select("id").single();
    if (error || !sale) { setSaving(false); return toast.error(error?.message ?? "Could not save sale"); }

    const items = cart.map((l) => ({
      sale_id: sale.id, user_id: user.id,
      product_id: l.product.id, product_name: l.product.name,
      quantity: l.qty, unit_price: Number(l.product.price), unit_cost: Number(l.product.cost ?? 0),
    }));
    const { error: itemErr } = await supabase.from("sale_items").insert(items);
    setSaving(false);
    if (itemErr) return toast.error(itemErr.message);
    toast.success(`Sale recorded · ${formatCurrency(total)}`);
    setCart([]); setCustomerId(""); setCustomerName("");
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Sales / POS" description="Tap products to add to the cart, then checkout." />
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="pl-9" />
            </div>
            {filtered.length === 0 ? (
              <EmptyState message="No products match. Add products from the Products page." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {filtered.map((p) => (
                  <button key={p.id} onClick={() => addToCart(p)} className="group rounded-xl border border-border bg-background p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm">
                    <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Stock: {Number(p.stock)}</p>
                    <p className="mt-2 text-sm font-semibold text-primary">{formatCurrency(Number(p.price))}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="h-4 w-4" /> Cart</h3>
              {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-muted-foreground hover:text-destructive">Clear</button>}
            </div>
            {cart.length === 0 ? (
              <p className="rounded-lg bg-muted p-4 text-center text-xs text-muted-foreground">Tap a product to add</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((l) => (
                  <li key={l.product.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.product.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(Number(l.product.price))} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product.id, l.qty - 1)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-6 text-center text-sm">{l.qty}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product.id, l.qty + 1)}><Plus className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(l.product.id, 0)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Customer</Label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="">Walk-in / no customer</option>
                  {customers.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                </select>
                {!customerId && (
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Or type a name" className="text-sm" />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payment</Label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank transfer</option>
                </select>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Items</span><span>{totals.items}</span>
              </div>
              <div className="flex items-center justify-between text-base font-semibold">
                <span>Total</span><span className="text-primary">{formatCurrency(totals.subtotal)}</span>
              </div>
              <Button disabled={cart.length === 0 || saving} onClick={checkout} className="w-full bg-primary hover:bg-primary/90">
                {saving ? "Processing…" : "Checkout"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
