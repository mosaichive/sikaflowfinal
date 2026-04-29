import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/products")({
  head: () => ({ meta: [{ title: "Products — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Products" description="Manage your product catalog and pricing." icon={Package} />
    </AppShell>
  ),
});
