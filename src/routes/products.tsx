import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { AddProductDialog } from "@/components/dashboard/Dialogs";
import { formatCurrency, formatNumber } from "@/lib/format";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Product = {
  id: string; name: string; sku: string | null;
  price: number; cost: number; stock: number; low_stock_threshold: number;
};

export const Route = createFileRoute("/products")({
  head: () => ({ meta: [{ title: "Products — SikaFlow" }] }),
  component: ProductsPage,
});

function ProductsPage() {
  const { ready, user } = useRequireUser();
  const [items, setItems] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("products").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems((data as Product[]) ?? []);
  }

  useEffect(() => { if (ready) load(); }, [ready]); // eslint-disable-line

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`prod-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]); // eslint-disable-line

  async function remove(id: string) {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Product deleted");
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  const filtered = items.filter((p) =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Products"
          description={`${items.length} products in your catalog`}
          action={<Button onClick={() => setOpenAdd(true)} className="bg-primary hover:bg-primary/90"><Plus className="mr-1 h-4 w-4" />Add product</Button>}
        />
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products…" className="pl-9" />
          </div>
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No products yet. Add your first product to start tallying sales." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const low = Number(p.stock) <= Number(p.low_stock_threshold);
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.name}</p>
                          {p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
                        </td>
                        <td className="px-4 py-3">{formatCurrency(Number(p.price))}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatCurrency(Number(p.cost))}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${low ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground"}`}>
                            {low && <AlertTriangle className="h-3 w-3" />}
                            {formatNumber(Number(p.stock))}{low && " · low"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="icon" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
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
      <AddProductDialog open={openAdd} onOpenChange={setOpenAdd} />
      <EditProductDialog product={editing} onClose={() => setEditing(null)} />
    </AppShell>
  );
}

function EditProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [form, setForm] = useState<Product | null>(null);
  useEffect(() => setForm(product), [product]);
  if (!form) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const { error } = await supabase.from("products").update({
      name: form.name, sku: form.sku, price: Number(form.price), cost: Number(form.cost),
      stock: Number(form.stock), low_stock_threshold: Number(form.low_stock_threshold),
    }).eq("id", form.id);
    if (error) return toast.error(error.message);
    toast.success("Product updated");
    onClose();
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit product</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div className="space-y-2"><Label>SKU</Label><Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Price</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} /></div>
            <div className="space-y-2"><Label>Cost</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Stock</Label><Input type="number" step="1" value={form.stock} onChange={(e) => setForm({ ...form, stock: parseFloat(e.target.value) || 0 })} /></div>
            <div className="space-y-2"><Label>Low-stock alert</Label><Input type="number" step="1" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <DialogFooter><Button type="submit" className="bg-primary hover:bg-primary/90">Save changes</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
