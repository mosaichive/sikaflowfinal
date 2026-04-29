import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { PageLoader } from "@/lib/use-require-user";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Settings2, ShieldOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin" }] }),
  component: AdminUsersPage,
});

type Profile = {
  id: string;
  email: string | null;
  business_name: string | null;
  subscription_plan: "trial" | "monthly" | "annual";
  subscription_status: "trial" | "active" | "expired" | "suspended";
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  trial_end_date: string | null;
  suspended: boolean;
  created_at: string;
};

function AdminUsersPage() {
  const { ready } = useRequireAdmin();
  const [users, setUsers] = useState<Profile[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);

  async function load() {
    const { data } = await supabase
      .from("profiles")
      .select("id,email,business_name,subscription_plan,subscription_status,subscription_start_date,subscription_end_date,trial_end_date,suspended,created_at")
      .order("created_at", { ascending: false });
    setUsers((data as Profile[]) ?? []);
  }

  useEffect(() => { if (ready) load(); }, [ready]);

  if (!ready) return <PageLoader />;

  const filtered = users.filter((u) => {
    const s = q.toLowerCase();
    return !s || u.email?.toLowerCase().includes(s) || u.business_name?.toLowerCase().includes(s);
  });

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage subscriptions, status, and access. Business data is private.</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or business" className="pl-9" />
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ends</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{u.business_name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3 capitalize">{u.subscription_plan}</td>
                    <td className="px-4 py-3"><StatusBadge status={u.suspended ? "suspended" : u.subscription_status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(u.subscription_end_date || u.trial_end_date) ? new Date(u.subscription_end_date || u.trial_end_date!).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
                        <Settings2 className="mr-1 h-3.5 w-3.5" /> Manage
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <ManageUserDialog user={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-500",
    trial: "bg-amber-500/10 text-amber-500",
    expired: "bg-rose-500/10 text-rose-500",
    suspended: "bg-zinc-500/15 text-zinc-500",
  };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] ?? ""}`}>{status}</span>;
}

function ManageUserDialog({ user, onClose, onSaved }: { user: Profile | null; onClose: () => void; onSaved: () => void }) {
  const [plan, setPlan] = useState<Profile["subscription_plan"]>("trial");
  const [status, setStatus] = useState<Profile["subscription_status"]>("trial");
  const [endDate, setEndDate] = useState("");
  const [suspended, setSuspended] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setPlan(user.subscription_plan);
      setStatus(user.subscription_status);
      setEndDate((user.subscription_end_date || user.trial_end_date || "").slice(0, 10));
      setSuspended(user.suspended);
    }
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      subscription_plan: plan as any,
      subscription_status: (suspended ? "suspended" : status) as any,
      subscription_end_date: endDate ? new Date(endDate).toISOString() : null,
      subscription_start_date: status === "active" ? new Date().toISOString() : user.subscription_start_date,
      suspended,
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("User updated");
    onSaved();
  }

  function extend(days: number) {
    const base = endDate ? new Date(endDate) : new Date();
    base.setDate(base.getDate() + days);
    setEndDate(base.toISOString().slice(0, 10));
  }

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage user</DialogTitle>
        </DialogHeader>
        {user && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{user.business_name || "Untitled business"}</p>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={(v) => setPlan(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as any)} disabled={suspended}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Subscription ends</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => extend(30)}>+30 days</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => extend(90)}>+90 days</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => extend(365)}>+1 year</Button>
              </div>
            </div>
            <Button
              type="button"
              variant={suspended ? "outline" : "destructive"}
              className="w-full"
              onClick={() => setSuspended(!suspended)}
            >
              {suspended ? <><ShieldCheck className="mr-2 h-4 w-4" /> Unsuspend account</> : <><ShieldOff className="mr-2 h-4 w-4" /> Suspend account</>}
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
