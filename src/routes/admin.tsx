import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { PageLoader } from "@/lib/use-require-user";
import { Card } from "@/components/ui/card";
import { Users, Activity, CreditCard, Clock, ShieldOff, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin Overview — SikaFlow" }] }),
  component: AdminOverview,
});

type Stats = {
  total_users: number;
  trial_users: number;
  active_users: number;
  expired_users: number;
  suspended_users: number;
  monthly_subs: number;
  annual_subs: number;
  pending_payments: number;
  signups_last_30d: number;
};

function AdminOverview() {
  const { ready } = useRequireAdmin();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!ready) return;
    supabase.rpc("admin_platform_stats").then(({ data }) => setStats((data as unknown as Stats) ?? null));
  }, [ready]);

  if (!ready) return <PageLoader />;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Super Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Platform Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">Aggregate metrics only. No business data is shown here.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard icon={Users} label="Total users" value={stats?.total_users ?? 0} tone="primary" />
          <StatCard icon={Activity} label="Active subscribers" value={stats?.active_users ?? 0} tone="emerald" />
          <StatCard icon={Clock} label="On trial" value={stats?.trial_users ?? 0} tone="amber" />
          <StatCard icon={ShieldOff} label="Expired" value={stats?.expired_users ?? 0} tone="rose" />
          <StatCard icon={CreditCard} label="Pending payments" value={stats?.pending_payments ?? 0} tone="primary" />
          <StatCard icon={TrendingUp} label="Sign-ups (30d)" value={stats?.signups_last_30d ?? 0} tone="emerald" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-muted-foreground">Active plans</h3>
            <div className="mt-4 space-y-3">
              <PlanRow label="Monthly" value={stats?.monthly_subs ?? 0} />
              <PlanRow label="Annual" value={stats?.annual_subs ?? 0} />
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-muted-foreground">Suspended accounts</h3>
            <p className="mt-3 text-3xl font-semibold">{stats?.suspended_users ?? 0}</p>
            <p className="mt-2 text-sm text-muted-foreground">Manage from the Users page.</p>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone: string }) {
  const toneMap: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-500",
    amber: "bg-amber-500/10 text-amber-500",
    rose: "bg-rose-500/10 text-rose-500",
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneMap[tone]}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value.toLocaleString()}</p>
    </Card>
  );
}

function PlanRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}
