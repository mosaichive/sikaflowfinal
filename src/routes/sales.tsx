import { createFileRoute } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { AppShell } from "@/components/nav/AppShell";
import { PagePlaceholder } from "@/components/nav/PagePlaceholder";

export const Route = createFileRoute("/sales")({
  head: () => ({ meta: [{ title: "Sales / POS — SikaFlow" }] }),
  component: () => (
    <AppShell>
      <PagePlaceholder title="Sales / POS" description="Record and manage point-of-sale transactions." icon={ShoppingCart} />
    </AppShell>
  ),
});
