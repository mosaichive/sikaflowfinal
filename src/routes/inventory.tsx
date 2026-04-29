import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Inventory" description="Track stock levels and low-stock alerts." icon={Boxes} />
    </AppShell>
  ),
});
