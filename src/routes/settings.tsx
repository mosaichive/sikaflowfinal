import { createFileRoute } from "@tanstack/react-router";
import { Settings as SettingsIcon } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Settings" description="Manage business profile and preferences." icon={SettingsIcon} />
    </AppShell>
  ),
});
