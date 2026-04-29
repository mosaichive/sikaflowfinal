import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, Landmark, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "./products";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { DateFilterBar } from "@/components/DateFilterBar";
import { useDateFilter, inRange } from "@/lib/date-filter";

type SavingsType = "bank" | "mobile_money" | "susu";
type Saving = {
  id: string;
  amount: number;
  savings_date: string;
  type: SavingsType;
  institution: string | null;
  account_name: string | null;
  note: string | null;
};

const TYPE_LABELS: Record<SavingsType, string> = {
  bank: "Bank",
  mobile_money: "Mobile Money",
  susu: "Susu",
};

const TYPE_ICONS: Record<SavingsType, React.ComponentType<{ className?: string }>> = {
  bank: Landmark,
  mobile_money: Smartphone,
  susu: Users,
};

export const Route = createFileRoute("/savings")({
  head: () => ({ meta: [{ title: "Savings — SikaFlow" }] }),
  component: SavingsPage,
});

function SavingsPage() {
  const { ready, user } = useRequireUser();
  const [items, setItems] = useState<Saving[]>([]);
  const [available, setAvailable] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Saving | null>(null);
  const [form, setForm] = useState({
    amount: "",
    type: "bank" as SavingsType,
    institution: "",
    account_name: "",
    note: "",
    savings_date: new Date().toISOString().slice(0, 10),
  });
  const { filter, setFilter, range } = useDateFilter();

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: savings }, { data: sales }, { data: income }, { data: expenses }] = await Promise.all([
      supabase.from("savings").select("*").eq("user_id", user.id).order("savings_date", { ascending: false }),
      supabase.from("sales").select("total").eq("user_id", user.id),
      supabase.from("other_income").select("amount").eq("user_id", user.id),
      supabase.from("expenses").select("amount").eq("user_id", user.id),
    ]);
    const all = (savings as Saving[]) ?? [];
    setItems(all);
    const totalSales = (sales ?? []).reduce((s, x) => s + Number(x.total), 0);
    const totalIncome = (income ?? []).reduce((s, x) => s + Number(x.amount), 0);
    const totalExp = (expenses ?? []).reduce((s, x) => s + Number(x.amount), 0);
    const totalSaved = all.reduce((s, x) => s + Number(x.amount), 0);
    setAvailable(totalSales + totalIncome - totalExp - totalSaved);
  }, [user]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`sav-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "savings", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "other_income", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const filtered = useMemo(() => items.filter((s) => inRange(s.savings_date, range)), [items, range]);

  const totals = useMemo(() => {
    const all = filtered.reduce((s, x) => s + Number(x.amount), 0);
    const byType = (t: SavingsType) =>
      filtered.filter((s) => s.type === t).reduce((s, x) => s + Number(x.amount), 0);
    return { all, bank: byType("bank"), mobile_money: byType("mobile_money"), susu: byType("susu") };
  }, [filtered]);

  function resetForm() {
    setForm({
      amount: "", type: "bank", institution: "", account_name: "", note: "",
      savings_date: new Date().toISOString().slice(0, 10),
    });
    setEditing(null);
  }

  function openAdd() { resetForm(); setOpen(true); }

  function openEdit(s: Saving) {
    setEditing(s);
    setForm({
      amount: String(s.amount),
      type: s.type,
      institution: s.institution ?? "",
      account_name: s.account_name ?? "",
      note: s.note ?? "",
      savings_date: s.savings_date.slice(0, 10),
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const amount = parseFloat(form.amount) || 0;
    if (amount <= 0) return toast.error("Enter a positive amount");

    // Cap by available money. When editing, we add back the original amount first.
    const headroom = available + (editing ? Number(editing.amount) : 0);
    if (amount > headroom + 0.001) {
      return toast.error(`Amount exceeds Available Money (${formatCurrency(headroom)})`);
    }

    const payload = {
      user_id: user.id,
      amount,
      type: form.type,
      institution: form.institution.trim() || null,
      account_name: form.account_name.trim() || null,
      note: form.note.trim() || null,
      savings_date: new Date(form.savings_date).toISOString(),
    };

    const { error } = editing
      ? await supabase.from("savings").update(payload).eq("id", editing.id)
      : await supabase.from("savings").insert(payload);

    if (error) return toast.error(error.message);
    toast.success(editing ? "Savings updated" : "Savings recorded");
    setOpen(false);
    resetForm();
  }

  async function remove(id: string) {
    if (!confirm("Delete this savings entry? Available Money will be updated.")) return;
    const { error } = await supabase.from("savings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Savings"
          description={`Available Money: ${formatCurrency(available)}`}
          action={
            <Button onClick={openAdd} className="bg-primary hover:bg-primary/90">
              <Plus className="mr-1 h-4 w-4" />Add savings
            </Button>
          }
        />

        <DateFilterBar filter={filter} onChange={setFilter} allowAll />

        {/* Summary cards */}
        <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total saved" value={formatCurrency(totals.all)} tone="primary" />
          <SummaryCard icon={Landmark} label="Bank" value={formatCurrency(totals.bank)} />
          <SummaryCard icon={Smartphone} label="Mobile Money" value={formatCurrency(totals.mobile_money)} />
          <SummaryCard icon={Users} label="Susu" value={formatCurrency(totals.susu)} />
        </section>

        {/* History table */}
        <div className="mt-6">
          {filtered.length === 0 ? (
            <EmptyState message="No savings in this date range." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Institution / Account</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const Icon = TYPE_ICONS[s.type];
                    return (
                      <tr key={s.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-primary">
                            <Icon className="h-3.5 w-3.5" />
                            {TYPE_LABELS[s.type]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{s.institution || "—"}</p>
                          {s.account_name && <p className="text-xs text-muted-foreground">{s.account_name}</p>}
                          {s.note && <p className="text-xs text-muted-foreground italic">{s.note}</p>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(s.savings_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 font-semibold text-primary">
                          {formatCurrency(Number(s.amount))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s)} aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(s.id)} aria-label="Delete">
                            <Trash2 className="h-4 w-4" />
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
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit savings" : "Add savings"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={form.savings_date}
                  onChange={(e) => setForm({ ...form, savings_date: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as SavingsType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="mobile_money">Mobile Money</SelectItem>
                  <SelectItem value="susu">Susu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Institution / name</Label>
              <Input
                value={form.institution}
                onChange={(e) => setForm({ ...form, institution: e.target.value })}
                placeholder="e.g. GCB Bank, MTN MoMo, Mama Susu"
              />
            </div>
            <div className="space-y-2">
              <Label>Account or wallet name</Label>
              <Input
                value={form.account_name}
                onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                placeholder="e.g. Business Savings, 0244..."
              />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground">
              Available Money: <span className="font-semibold text-foreground">{formatCurrency(available + (editing ? Number(editing.amount) : 0))}</span>
            </p>
            <DialogFooter>
              <Button type="submit" className="bg-primary hover:bg-primary/90">
                {editing ? "Save changes" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryCard({
  label, value, tone, icon: Icon,
}: {
  label: string; value: string; tone?: "primary"; icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${
      tone === "primary" ? "border-primary/30 bg-gradient-to-br from-primary/5 to-transparent" : "border-border bg-card"
    }`}>
      <div className="flex items-center justify-between">
        {Icon ? (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
            <Icon className="h-4.5 w-4.5" />
          </span>
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Landmark className="h-4.5 w-4.5" />
          </span>
        )}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
    </div>
  );
}
