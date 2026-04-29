import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogOut, Sparkles, AlertTriangle } from "lucide-react";
import { trialDaysLeft, isTrialActive } from "@/lib/trial";
import { toast } from "sonner";
import { PageHeader } from "./products";

type Profile = {
  business_name: string | null; phone: string | null; email: string | null;
  business_type: string | null; num_employees: string | null; location: string | null;
  role: string | null; trial_end_date: string;
};

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — SikaFlow" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { ready, user } = useRequireUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("profiles").select("business_name,phone,email,business_type,num_employees,location,role,trial_end_date").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data as Profile));
  }, [ready, user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      business_name: profile.business_name, phone: profile.phone,
      business_type: profile.business_type, num_employees: profile.num_employees,
      location: profile.location, role: profile.role,
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  }

  if (!ready || !profile) return <AppShell><PageLoader /></AppShell>;

  const trialActive = isTrialActive(profile.trial_end_date);
  const daysLeft = trialDaysLeft(profile.trial_end_date);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Settings" description="Update your business details and preferences." />

        <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Subscription</p>
              <p className="mt-1 text-lg font-semibold">
                {trialActive ? <span className="inline-flex items-center gap-1.5 text-primary"><Sparkles className="h-4 w-4" />Free trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left</span>
                  : <span className="inline-flex items-center gap-1.5 text-warning-foreground"><AlertTriangle className="h-4 w-4" />Trial ended</span>}
              </p>
              <p className="text-xs text-muted-foreground">Renews / expires {new Date(profile.trial_end_date).toLocaleDateString()}</p>
            </div>
            <Button variant="outline" onClick={() => toast.info("Upgrade options coming soon!")}>Upgrade</Button>
          </div>
        </div>

        <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Business profile</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name"><Input value={profile.business_name ?? ""} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} /></Field>
            <Field label="Email"><Input value={profile.email ?? ""} disabled /></Field>
            <Field label="Phone"><Input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
            <Field label="Your role"><Input value={profile.role ?? ""} onChange={(e) => setProfile({ ...profile, role: e.target.value })} /></Field>
            <Field label="Business type"><Input value={profile.business_type ?? ""} onChange={(e) => setProfile({ ...profile, business_type: e.target.value })} /></Field>
            <Field label="Employees"><Input value={profile.num_employees ?? ""} onChange={(e) => setProfile({ ...profile, num_employees: e.target.value })} /></Field>
            <Field label="Location"><Input value={profile.location ?? ""} onChange={(e) => setProfile({ ...profile, location: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">{saving ? "Saving…" : "Save changes"}</Button></div>
        </form>

        <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Appearance</h3>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Switch between light and dark.</p>
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <h3 className="text-sm font-semibold text-destructive">Sign out</h3>
          <p className="mt-1 text-xs text-muted-foreground">You can sign back in anytime to access your data.</p>
          <Button variant="outline" className="mt-3" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
