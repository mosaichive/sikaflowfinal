import { createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Staff / Users" description="Invite team members and manage roles." icon={UserCog} />
    </AppShell>
  ),
});
