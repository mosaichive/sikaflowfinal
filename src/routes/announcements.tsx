import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/announcements")({
  head: () => ({ meta: [{ title: "Announcements — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Announcements" description="Share news and updates with your team." icon={Megaphone} />
    </AppShell>
  ),
});
