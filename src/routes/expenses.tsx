import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Expenses" description="Log and categorise business expenses." icon={Receipt} />
    </AppShell>
  ),
});
