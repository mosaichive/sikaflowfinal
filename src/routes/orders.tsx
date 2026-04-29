import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Orders" description="View and fulfil customer orders." icon={ClipboardList} />
    </AppShell>
  ),
});
