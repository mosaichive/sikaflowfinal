import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, AlertTriangle, Info, Sparkles } from "lucide-react";
import { PageHeader, EmptyState } from "./products";

type Announcement = {
  id: string; title: string; message: string;
  priority: "low" | "normal" | "high"; publish_at: string;
};

export const Route = createFileRoute("/announcements")({
  head: () => ({ meta: [{ title: "Announcements — SikaFlow" }] }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { ready } = useRequireUser();
  const [items, setItems] = useState<Announcement[]>([]);

  async function load() {
    const { data } = await supabase.from("announcements")
      .select("id,title,message,priority,publish_at")
      .lte("publish_at", new Date().toISOString())
      .order("publish_at", { ascending: false });
    setItems((data as Announcement[]) ?? []);
  }
  useEffect(() => { if (ready) load(); }, [ready]);
  useEffect(() => {
    const channel = supabase.channel("anns")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Announcements" description="Updates and news from the SikaFlow team." />
        {items.length === 0 ? (
          <EmptyState message="No announcements right now. Check back soon!" />
        ) : (
          <div className="space-y-3">
            {items.map((a) => {
              const tone = a.priority === "high" ? "danger" : a.priority === "low" ? "muted" : "info";
              const Icon = a.priority === "high" ? AlertTriangle : a.priority === "low" ? Info : Sparkles;
              const cls = tone === "danger" ? "border-destructive/40 bg-destructive/5"
                : tone === "muted" ? "border-border bg-card"
                : "border-primary/30 bg-primary/5";
              const ic = tone === "danger" ? "bg-destructive/15 text-destructive"
                : tone === "muted" ? "bg-muted text-muted-foreground"
                : "bg-primary/15 text-primary";
              return (
                <div key={a.id} className={`flex gap-3 rounded-2xl border p-4 shadow-sm ${cls}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ic}`}><Icon className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold">{a.title}</h3>
                      <p className="text-xs text-muted-foreground">{new Date(a.publish_at).toLocaleString()}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{a.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {items.length === 0 && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
            <Megaphone className="h-5 w-5" />
            We'll post product news, tips and updates here.
          </div>
        )}
      </div>
    </AppShell>
  );
}
