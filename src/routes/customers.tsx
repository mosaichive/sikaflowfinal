import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/customers")({
  head: () => ({ meta: [{ title: "Customers — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Customers" description="Manage customer profiles and history." icon={Users} />
    </AppShell>
  ),
});
