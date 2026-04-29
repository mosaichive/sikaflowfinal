import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Boxes, AlertTriangle, Search } from "lucide-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "./products";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Product = { id: string; name: string; price: number; cost: number; stock: number; low_stock_threshold: number };

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SikaFlow" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { ready, user } = useRequireUser();
  const [items, setItems] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("Stock count");

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("products").select("*").eq("user_id", user.id).order("name");
    setItems((data as Product[]) ?? []);
  }
  useEffect(() => { if (ready) load(); }, [ready]); // eslint-disable-line
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`inv-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]); // eslint-disable-line

  const filtered = items.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const stats = useMemo(() => {
    const totalUnits = items.reduce((s, p) => s + Number(p.stock), 0);
    const totalValue = items.reduce((s, p) => s + Number(p.stock) * Number(p.price), 0);
    const lowCount = items.filter((p) => Number(p.stock) <= Number(p.low_stock_threshold)).length;
    return { totalUnits, totalValue, lowCount };
  }, [items]);

  async function applyAdjustment() {
    if (!adjust) return;
    const change = parseFloat(delta);
    if (Number.isNaN(change)) return toast.error("Enter a number (positive or negative)");
    const newStock = Math.max(0, Number(adjust.stock) + change);
    const { error } = await supabase.from("products").update({ stock: newStock }).eq("id", adjust.id);
    if (error) return toast.error(error.message);
    toast.success(`Stock updated to ${newStock} (${reason})`);
    setAdjust(null); setDelta("");
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Inventory" description="Track stock levels and adjust counts." />
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatTile icon={Boxes} label="Total units" value={formatNumber(stats.totalUnits)} />
          <StatTile icon={Boxes} label="Stock value" value={formatCurrency(stats.totalValue)} />
          <StatTile icon={AlertTriangle} label="Low stock" value={`${stats.lowCount} items`} tone={stats.lowCount > 0 ? "warning" : undefined} />
        </div>
        <div className="mb-4 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No products yet. Add some on the Products page." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3 text-right">Adjust</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const low = Number(p.stock) <= Number(p.low_stock_threshold);
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${low ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>
                            {low && <AlertTriangle className="h-3 w-3" />}
                            {formatNumber(Number(p.stock))}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatCurrency(Number(p.stock) * Number(p.price))}</td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => { setAdjust(p); setDelta(""); }}>Adjust</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust stock — {adjust?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Current stock: <span className="font-medium text-foreground">{adjust ? Number(adjust.stock) : 0}</span></p>
            <div className="space-y-2">
              <Label>Change (use negative to reduce)</Label>
              <Input type="number" step="1" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 10 or -3" />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
                {["Stock count", "Received delivery", "Damage / loss", "Return", "Other"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter><Button onClick={applyAdjustment} className="bg-primary hover:bg-primary/90">Apply</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "warning" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "warning" ? "border-warning/40 bg-warning/10" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
