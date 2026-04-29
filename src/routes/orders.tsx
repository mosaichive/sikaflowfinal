import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { PageHeader, EmptyState } from "./products";
import { DateFilterBar } from "@/components/DateFilterBar";
import { useDateFilter, inRange } from "@/lib/date-filter";

type Sale = { id: string; total: number; payment_method: string; customer_name: string | null; sale_date: string };
type Item = { id: string; sale_id: string; product_name: string; quantity: number; unit_price: number };

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders — SikaFlow" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { ready, user } = useRequireUser();
  const [sales, setSales] = useState<Sale[]>([]);
  const [itemsBySale, setItemsBySale] = useState<Record<string, Item[]>>({});
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const [{ data: ss }, { data: items }] = await Promise.all([
      supabase.from("sales").select("*").eq("user_id", user.id).order("sale_date", { ascending: false }).limit(200),
      supabase.from("sale_items").select("*").eq("user_id", user.id),
    ]);
    setSales((ss as Sale[]) ?? []);
    const map: Record<string, Item[]> = {};
    ((items as Item[]) ?? []).forEach((it) => { (map[it.sale_id] ??= []).push(it); });
    setItemsBySale(map);
  }
  useEffect(() => { if (ready) load(); }, [ready]); // eslint-disable-line
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`ord-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_items", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]); // eslint-disable-line

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Orders" description={`${sales.length} recent orders`} />
        {sales.length === 0 ? (
          <EmptyState message="No orders yet. Record sales from the Sales / POS page." />
        ) : (
          <div className="space-y-2">
            {sales.map((s) => {
              const items = itemsBySale[s.id] ?? [];
              const isOpen = open === s.id;
              return (
                <div key={s.id} className="rounded-2xl border border-border bg-card shadow-sm">
                  <button onClick={() => setOpen(isOpen ? null : s.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                    <div className="flex min-w-0 items-center gap-3">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {s.customer_name || "Walk-in customer"} <span className="text-muted-foreground">· {items.length} {items.length === 1 ? "item" : "items"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.sale_date).toLocaleString()} · {s.payment_method.replace("_", " ")}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-primary">{formatCurrency(Number(s.total))}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border bg-muted/30 px-4 py-3 text-sm">
                      {items.length === 0 ? <p className="text-muted-foreground">No items.</p> : (
                        <ul className="divide-y divide-border">
                          {items.map((it) => (
                            <li key={it.id} className="flex items-center justify-between py-2">
                              <span>{it.product_name} <span className="text-muted-foreground">× {Number(it.quantity)}</span></span>
                              <span className="font-medium">{formatCurrency(Number(it.unit_price) * Number(it.quantity))}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
