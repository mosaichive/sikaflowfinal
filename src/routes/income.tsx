import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "./products";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";

type Income = { id: string; source: string; amount: number; note: string | null; income_date: string };

export const Route = createFileRoute("/income")({
  head: () => ({ meta: [{ title: "Other Income — SikaFlow" }] }),
  component: IncomePage,
});

function IncomePage() {
  const { ready, user } = useRequireUser();
  const [items, setItems] = useState<Income[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ source: "", amount: "", note: "" });

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("other_income").select("*").eq("user_id", user.id).order("income_date", { ascending: false });
    setItems((data as Income[]) ?? []);
  }
  useEffect(() => { if (ready) load(); }, [ready]); // eslint-disable-line
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`inc-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "other_income", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]); // eslint-disable-line

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.amount), 0), [items]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const amount = parseFloat(form.amount) || 0;
    if (!form.source.trim() || amount <= 0) return toast.error("Source and a positive amount are required");
    const { error } = await supabase.from("other_income").insert({
      user_id: user.id, source: form.source.trim(), amount, note: form.note.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Income recorded");
    setForm({ source: "", amount: "", note: "" });
    setOpen(false);
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("other_income").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Other Income"
          description={`Total: ${formatCurrency(total)}`}
          action={<Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary/90"><Plus className="mr-1 h-4 w-4" />Add income</Button>}
        />
        {items.length === 0 ? (
          <EmptyState message="No other income recorded. Add income that's not from your regular sales." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-4 py-3"><p className="font-medium">{i.source}</p>{i.note && <p className="text-xs text-muted-foreground">{i.note}</p>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(i.income_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-semibold text-success">{formatCurrency(Number(i.amount))}</td>
                    <td className="px-4 py-3 text-right"><Button size="icon" variant="ghost" onClick={() => remove(i.id)}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add other income</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-2"><Label>Source</Label><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g. Investment, Refund" required /></div>
            <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Note</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
            <DialogFooter><Button type="submit" className="bg-primary hover:bg-primary/90">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
