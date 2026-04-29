import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserCog } from "lucide-react";
import { PageHeader } from "./products";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — SikaFlow" }] }),
  component: StaffPage,
});

function StaffPage() {
  const { ready, user } = useRequireUser();
  const [profile, setProfile] = useState<{ business_name: string | null; email: string | null; role: string | null } | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("profiles").select("business_name,email,role").eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data ?? null));
  }, [ready, user]);

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Staff / Users" description="Team members with access to your business." />
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Owner</h3>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-background p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {(profile?.business_name || profile?.email || "U").slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="text-sm font-medium">{profile?.business_name || "You"}</p>
              <p className="text-xs text-muted-foreground">{profile?.email} · {profile?.role || "Owner"}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary"><UserCog className="h-5 w-5" /></span>
          <h3 className="mt-3 text-base font-semibold">Multi-user teams coming soon</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Invite staff with custom permissions in an upcoming release. For now, your account is the sole owner.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
