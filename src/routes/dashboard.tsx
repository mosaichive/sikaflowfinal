import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { trialDaysLeft, isTrialActive } from "@/lib/trial";
import {
  Plus, Package, Receipt, BarChart3, TrendingUp, Boxes,
  Wallet, ShoppingBag, LogOut, Sparkles, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SikaFlow" }] }),
  component: DashboardPage,
});

type Profile = {
  business_name: string | null;
  trial_end_date: string;
  onboarding_completed: boolean;
};

function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("business_name, trial_end_date, onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (!data) return;
      if (!data.onboarding_completed) { navigate({ to: "/onboarding" }); return; }
      setProfile(data as Profile);
    })();
  }, [user, loading, navigate]);

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const trialActive = isTrialActive(profile.trial_end_date);
  const daysLeft = trialDaysLeft(profile.trial_end_date);
  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            {trialActive ? (
              <span className="hidden items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary sm:inline-flex">
                <Sparkles className="h-3.5 w-3.5" />
                Free Trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>
            ) : (
              <span className="hidden items-center gap-1.5 rounded-full bg-warning/20 px-3 py-1 text-xs font-medium text-warning-foreground sm:inline-flex">
                <AlertTriangle className="h-3.5 w-3.5" /> Trial ended
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => { await signOut(); navigate({ to: "/" }); }}
            >
              <LogOut className="mr-1 h-4 w-4" /> Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Greeting */}
        <section className="animate-fade-up">
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {profile.business_name || "Your business"}
          </h1>
        </section>

        {/* Trial banner (mobile / expired) */}
        {!trialActive && (
          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/30 text-warning-foreground">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium">Your free trial has ended</p>
                <p className="text-sm text-muted-foreground">Upgrade to continue using all features.</p>
              </div>
            </div>
            <Button onClick={() => toast.info("Upgrade options coming soon!")} className="bg-gradient-primary shadow-glow">
              Upgrade now
            </Button>
          </div>
        )}
        {trialActive && daysLeft <= 7 && (
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-primary/30 bg-accent/60 p-4">
            <p className="text-sm">
              <span className="font-semibold">{daysLeft} {daysLeft === 1 ? "day" : "days"}</span> left in your free trial.
            </p>
            <Button size="sm" variant="outline" onClick={() => toast.info("Upgrade options coming soon!")}>
              Upgrade
            </Button>
          </div>
        )}

        {/* Stat cards */}
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={ShoppingBag} label="Sales today" value="0" hint="No sales yet" />
          <StatCard icon={TrendingUp} label="Total revenue" value="GHS 0.00" hint="All time" />
          <StatCard icon={Boxes} label="Inventory" value="0 items" hint="Nothing in stock" />
          <StatCard icon={Wallet} label="Expenses" value="GHS 0.00" hint="This month" />
        </section>

        {/* Quick actions */}
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionTile icon={Plus} label="Add Sale" tone="primary" />
            <ActionTile icon={Package} label="Add Product" />
            <ActionTile icon={Receipt} label="Record Expense" />
            <ActionTile icon={BarChart3} label="View Reports" />
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, hint,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-primary">
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ActionTile({
  icon: Icon, label, tone,
}: { icon: React.ComponentType<{ className?: string }>; label: string; tone?: "primary" }) {
  const isPrimary = tone === "primary";
  return (
    <button
      onClick={() => toast.info(`${label} — coming soon`)}
      className={`group flex items-center gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isPrimary
          ? "border-transparent bg-gradient-primary text-primary-foreground shadow-glow"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${isPrimary ? "bg-white/20" : "bg-accent text-primary"}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
