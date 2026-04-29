import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Boxes, AlertTriangle, Search, Plus, Minus, History } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "./products";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Product = { id: string; name: string; price: number; cost: number; stock: number; low_stock_threshold: number };
type Movement = { id: string; product_id: string; change: number; reason: string; note: string | null; created_at: string };

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SikaFlow" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { ready, user } = useRequireUser();
  const [items, setItems] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [q, setQ] = useState("");
  const [adjust, setAdjust] = useState<{ product: Product; mode: "add" | "remove" } | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("received");
  const [historyFor, setHistoryFor] = useState<Product | null>(null);

  async function load() {
    if (!user) return;
    const [{ data: prods }, { data: moves }] = await Promise.all([
      supabase.from("products").select("*").eq("user_id", user.id).order("name"),
      supabase.from("stock_movements").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
    ]);
    setItems((prods as Product[]) ?? []);
    setMovements((moves as Movement[]) ?? []);
  }
  useEffect(() => { if (ready) load(); /* eslint-disable-next-line */ }, [ready]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`inv-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line
  }, [user]);

  const filtered = items.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const stats = useMemo(() => {
    const totalUnits = items.reduce((s, p) => s + Number(p.stock), 0);
    const totalValue = items.reduce((s, p) => s + Number(p.stock) * Number(p.price), 0);
    const lowCount = items.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.low_stock_threshold)).length;
    const outCount = items.filter((p) => Number(p.stock) <= 0).length;
    return { totalUnits, totalValue, lowCount, outCount };
  }, [items]);

  async function applyAdjustment() {
    if (!adjust || !user) return;
    const amount = parseFloat(delta);
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter a positive quantity");
    const change = adjust.mode === "add" ? amount : -amount;
    const newStock = Math.max(0, Number(adjust.product.stock) + change);
    if (adjust.mode === "remove" && amount > Number(adjust.product.stock)) {
      return toast.error(`Only ${Number(adjust.product.stock)} in stock`);
    }

    const { error } = await supabase.from("products").update({ stock: newStock }).eq("id", adjust.product.id);
    if (error) return toast.error(error.message);

    await supabase.from("stock_movements").insert({
      user_id: user.id, product_id: adjust.product.id, change, reason, note: null,
    });

    toast.success(`Stock updated · ${adjust.product.name} → ${newStock}`);
    setAdjust(null); setDelta(""); setReason("received");
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Inventory" description="Add stock, track movements, and watch low-stock items." />

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={Boxes} label="Total units" value={formatNumber(stats.totalUnits)} />
          <StatTile icon={Boxes} label="Stock value" value={formatCurrency(stats.totalValue)} />
          <StatTile icon={AlertTriangle} label="Low stock" value={`${stats.lowCount} items`} tone={stats.lowCount > 0 ? "warning" : undefined} />
          <StatTile icon={AlertTriangle} label="Out of stock" value={`${stats.outCount} items`} tone={stats.outCount > 0 ? "danger" : undefined} />
        </div>

        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="pl-9" />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState message="No products yet. Add some on the Products page." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const stock = Number(p.stock);
                    const out = stock <= 0;
                    const low = !out && stock <= Number(p.low_stock_threshold);
                    return (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3">{formatNumber(stock)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatCurrency(stock * Number(p.price))}</td>
                        <td className="px-4 py-3">
                          {out ? (
                            <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-500">Out of stock</span>
                          ) : low ? (
                            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-500">Low stock</span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">In stock</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => { setAdjust({ product: p, mode: "add" }); setReason("received"); }}>
                              <Plus className="mr-1 h-3.5 w-3.5" /> Add
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setAdjust({ product: p, mode: "remove" }); setReason("damage"); }}>
                              <Minus className="mr-1 h-3.5 w-3.5" /> Remove
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setHistoryFor(p)}>
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Add / Remove dialog */}
      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjust?.mode === "add" ? "Add stock" : "Remove stock"} — {adjust?.product.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current stock: <span className="font-medium text-foreground">{adjust ? Number(adjust.product.stock) : 0}</span>
            </p>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min="1" step="1" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 10" />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {adjust?.mode === "add" ? (
                    <>
                      <SelectItem value="received">Received delivery</SelectItem>
                      <SelectItem value="return">Customer return</SelectItem>
                      <SelectItem value="adjustment">Stock-take adjustment</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="damage">Damage / loss</SelectItem>
                      <SelectItem value="adjustment">Stock-take adjustment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjust(null)}>Cancel</Button>
            <Button onClick={applyAdjustment}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Stock history — {historyFor?.name}</DialogTitle></DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            <ul className="divide-y divide-border">
              {movements.filter((m) => m.product_id === historyFor?.id).slice(0, 50).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium capitalize">{m.reason}</p>
                    <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                  <span className={`font-semibold ${Number(m.change) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                    {Number(m.change) >= 0 ? "+" : ""}{Number(m.change)}
                  </span>
                </li>
              ))}
              {movements.filter((m) => m.product_id === historyFor?.id).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No movements yet.</p>
              )}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "warning" | "danger" }) {
  const toneClass =
    tone === "danger" ? "border-rose-500/30 bg-rose-500/5"
    : tone === "warning" ? "border-amber-500/30 bg-amber-500/5"
    : "border-border bg-card";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
