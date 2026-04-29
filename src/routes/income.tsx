import { createFileRoute } from "@tanstack/react-router";
import { PiggyBank } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/income")({
  head: () => ({ meta: [{ title: "Other Income — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Other Income" description="Record income outside of regular sales." icon={PiggyBank} />
    </AppShell>
  ),
});
