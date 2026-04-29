import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Reports" description="View sales, profit and inventory reports." icon={BarChart3} />
    </AppShell>
  ),
});
