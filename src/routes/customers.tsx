import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Search, Trash2, Pencil, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "./products";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";

type Customer = { id: string; name: string; phone: string | null; email: string | null; note: string | null };
type SaleAgg = { customer_id: string | null; total: number };

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "Customers — SikaFlow" }] }),
  component: CustomersPage,
});

function CustomersPage() {
  const { ready, user } = useRequireUser();
  const [items, setItems] = useState<Customer[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);

  async function load() {
    if (!user) return;
    const [{ data: cs }, { data: ss }] = await Promise.all([
      supabase.from("customers").select("*").eq("user_id", user.id).order("name"),
      supabase.from("sales").select("customer_id,total").eq("user_id", user.id),
    ]);
    setItems((cs as Customer[]) ?? []);
    const map: Record<string, number> = {};
    ((ss as SaleAgg[]) ?? []).forEach((s) => {
      if (!s.customer_id) return;
      map[s.customer_id] = (map[s.customer_id] ?? 0) + Number(s.total);
    });
    setTotals(map);
  }

  useEffect(() => { if (ready) load(); }, [ready]); // eslint-disable-line
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`cust-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]); // eslint-disable-line

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !user) return;
    const payload = {
      user_id: user.id,
      name: (editing.name || "").trim(),
      phone: editing.phone?.trim() || null,
      email: editing.email?.trim() || null,
      note: editing.note?.trim() || null,
    };
    if (!payload.name) return toast.error("Name is required");
    const { error } = editing.id
      ? await supabase.from("customers").update(payload).eq("id", editing.id)
      : await supabase.from("customers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing.id ? "Customer updated" : "Customer added");
    setEditing(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this customer?")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Customer deleted");
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  const filtered = items.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.phone ?? "").includes(q));

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Customers"
          description={`${items.length} customers`}
          action={<Button onClick={() => setEditing({})} className="bg-primary hover:bg-primary/90"><Plus className="mr-1 h-4 w-4" />Add customer</Button>}
        />
        <div className="mb-4 max-w-md relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone…" className="pl-9" />
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No customers yet. Add your first customer to keep track of buyers." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <div key={c.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">Total spent: {formatCurrency(totals[c.id] ?? 0)}</p>
                  </div>
                  <div className="flex">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  {c.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{c.phone}</p>}
                  {c.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{c.email}</p>}
                  {c.note && <p className="line-clamp-2 text-xs">{c.note}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "Edit customer" : "Add customer"}</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-2"><Label>Name</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Phone</Label><Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Note</Label><Input value={editing.note ?? ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
              <DialogFooter><Button type="submit" className="bg-primary hover:bg-primary/90">Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
