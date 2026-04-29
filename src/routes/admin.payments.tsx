import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { PageLoader } from "@/lib/use-require-user";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({ meta: [{ title: "Payments — Admin" }] }),
  component: AdminPaymentsPage,
});

type Payment = {
  id: string;
  user_id: string;
  plan: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  note: string | null;
  status: string;
  created_at: string;
};

function AdminPaymentsPage() {
  const { ready } = useRequireAdmin();
  const [items, setItems] = useState<Payment[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.from("subscription_payments").select("*").order("created_at", { ascending: false });
    const list = (data as Payment[]) ?? [];
    setItems(list);
    if (list.length) {
      const ids = [...new Set(list.map((p) => p.user_id))];
      const { data: profs } = await supabase.from("profiles").select("id,email,business_name").in("id", ids);
      const map: Record<string, string> = {};
      profs?.forEach((p: any) => { map[p.id] = p.business_name || p.email || p.id.slice(0, 8); });
      setEmails(map);
    }
  }

  useEffect(() => { if (ready) load(); }, [ready]);

  async function review(p: Payment, status: "approved" | "rejected") {
    const { error } = await supabase.from("subscription_payments").update({
      status,
      reviewed_at: new Date().toISOString(),
    }).eq("id", p.id);
    if (error) return toast.error(error.message);

    if (status === "approved") {
      const days = p.plan === "annual" ? 365 : 30;
      const start = new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + days);
      await supabase.from("profiles").update({
        subscription_plan: p.plan,
        subscription_status: "active",
        subscription_start_date: start.toISOString(),
        subscription_end_date: end.toISOString(),
        suspended: false,
      }).eq("id", p.user_id);
    }
    toast.success(`Payment ${status}`);
    load();
  }

  if (!ready) return <PageLoader />;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subscription payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review and approve payments submitted by users.</p>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium">{emails[p.user_id] ?? p.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-3 capitalize">{p.plan}</td>
                    <td className="px-4 py-3">{formatCurrency(Number(p.amount))}</td>
                    <td className="px-4 py-3 capitalize">{p.payment_method}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.reference ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                        p.status === "approved" ? "bg-emerald-500/10 text-emerald-500"
                        : p.status === "rejected" ? "bg-rose-500/10 text-rose-500"
                        : "bg-amber-500/10 text-amber-500"
                      }`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "pending" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => review(p, "approved")}>
                            <Check className="h-4 w-4 text-emerald-500" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => review(p, "rejected")}>
                            <X className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">No payments yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
