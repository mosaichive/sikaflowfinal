import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "./products";
import { AddExpenseDialog } from "@/components/dashboard/Dialogs";
import { EditExpenseDialog } from "@/components/EditDialogs";
import { formatCurrency } from "@/lib/format";
import { DateFilterBar } from "@/components/DateFilterBar";
import { useDateFilter, inRange } from "@/lib/date-filter";

type Expense = { id: string; amount: number; category: string; note: string | null; expense_date: string };
const CATEGORIES = ["All", "Supplies", "Rent", "Utilities", "Salary", "Transport", "Marketing", "Other"];

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — SikaFlow" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { ready, user } = useRequireUser();
  const [items, setItems] = useState<Expense[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const { filter: dateFilter, setFilter: setDateFilter, range } = useDateFilter();

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("expenses").select("*").eq("user_id", user.id).order("expense_date", { ascending: false });
    setItems((data as Expense[]) ?? []);
  }
  useEffect(() => { if (ready) load(); }, [ready]); // eslint-disable-line
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`exp-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]); // eslint-disable-line

  const filtered = useMemo(() => {
    return items
      .filter((i) => filter === "All" || i.category === filter)
      .filter((i) => inRange(i.expense_date, range));
  }, [items, filter, range]);
  const total = useMemo(() => filtered.reduce((s, i) => s + Number(i.amount), 0), [filtered]);

  async function remove(id: string) {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          title="Expenses"
          description={`${filtered.length} entries · Total ${formatCurrency(total)}`}
          action={<Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary/90"><Plus className="mr-1 h-4 w-4" />Add expense</Button>}
        />
        <DateFilterBar filter={dateFilter} onChange={setDateFilter} allowAll />
        <div className="mb-4 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setFilter(c)} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${filter === c ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"}`}>
              {c}
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="No expenses to show. Record an expense to keep your books accurate." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Category</th><th className="px-4 py-3">Note</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{i.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{i.note ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(i.expense_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-semibold text-destructive">{formatCurrency(Number(i.amount))}</td>
                    <td className="px-4 py-3 text-right"><Button size="icon" variant="ghost" onClick={() => remove(i.id)}><Trash2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AddExpenseDialog open={open} onOpenChange={setOpen} />
    </AppShell>
  );
}
