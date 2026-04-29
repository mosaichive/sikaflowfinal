import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Receipt, Download, AlertTriangle, History } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { PageHeader } from "./products";
import { generateInvoicePdf } from "@/server/invoices.functions";
import { useServerFn } from "@tanstack/react-start";
import { downloadBase64Pdf } from "@/lib/download";
import { DateFilterBar } from "@/components/DateFilterBar";
import { useDateFilter, inRange } from "@/lib/date-filter";

type Product = { id: string; name: string; price: number; cost: number; stock: number };
type Customer = { id: string; name: string; phone: string | null };
type RecentSale = { id: string; invoice_number: string | null; total: number; customer_name: string | null; sale_date: string };

export const Route = createFileRoute("/sales")({
  head: () => ({ meta: [{ title: "Sales / POS — SikaFlow" }] }),
  component: SalesPage,
});

function SalesPage() {
  const { ready, user } = useRequireUser();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recent, setRecent] = useState<RecentSale[]>([]);
  const generate = useServerFn(generateInvoicePdf);

  // form state
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [discount, setDiscount] = useState("");
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    if (!user) return;
    const [{ data: p }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("products").select("id,name,price,cost,stock").eq("user_id", user.id).order("name"),
      supabase.from("customers").select("id,name,phone").eq("user_id", user.id).order("name"),
      supabase.from("sales").select("id,invoice_number,total,customer_name,sale_date").eq("user_id", user.id).order("sale_date", { ascending: false }).limit(8),
    ]);
    setProducts((p as Product[]) ?? []);
    setCustomers((c as Customer[]) ?? []);
    setRecent((r as RecentSale[]) ?? []);
  }

  useEffect(() => { if (ready) loadAll(); /* eslint-disable-next-line */ }, [ready]);

  // realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`sales-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `user_id=eq.${user.id}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `user_id=eq.${user.id}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [user]);

  const product = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);
  const qty = Math.max(0, parseFloat(quantity) || 0);
  const disc = Math.max(0, parseFloat(discount) || 0);
  const paid = Math.max(0, parseFloat(amountPaid) || 0);
  const unitPrice = product ? Number(product.price) : 0;
  const unitCost = product ? Number(product.cost) : 0;
  const subtotal = qty * unitPrice;
  const total = Math.max(0, subtotal - disc);
  const balance = Math.max(0, total - paid);
  const profit = qty * (unitPrice - unitCost) - disc;

  const outOfStock = !!product && Number(product.stock) <= 0;
  const overStock = !!product && qty > Number(product.stock);

  async function record() {
    if (!user || !product) return toast.error("Select a product");
    if (qty <= 0) return toast.error("Quantity must be greater than 0");
    if (outOfStock) return toast.error("Out of stock");
    if (overStock) return toast.error(`Only ${Number(product.stock)} in stock`);

    setSaving(true);

    // upsert customer if name+phone provided and not already in list
    let customerId: string | null = null;
    if (customerName.trim()) {
      const existing = customers.find((c) => c.name.toLowerCase() === customerName.trim().toLowerCase());
      if (existing) customerId = existing.id;
      else {
        const { data: newC } = await supabase.from("customers").insert({
          user_id: user.id, name: customerName.trim(), phone: phone.trim() || null,
        }).select("id").single();
        customerId = newC?.id ?? null;
      }
    }

    const { data: sale, error } = await supabase.from("sales").insert({
      user_id: user.id,
      total,
      cost_total: qty * unitCost,
      discount: disc,
      amount_paid: paid,
      payment_method: paymentMethod,
      customer_id: customerId,
      customer_name: customerName.trim() || null,
      note: note.trim() || null,
      sale_date: new Date(saleDate).toISOString(),
    }).select("id,invoice_number").single();

    if (error || !sale) { setSaving(false); return toast.error(error?.message ?? "Could not save sale"); }

    const { error: itemErr } = await supabase.from("sale_items").insert([{
      sale_id: sale.id, user_id: user.id,
      product_id: product.id, product_name: product.name,
      quantity: qty, unit_price: unitPrice, unit_cost: unitCost,
    }]);

    if (itemErr) {
      // rollback
      await supabase.from("sales").delete().eq("id", sale.id);
      setSaving(false);
      return toast.error(itemErr.message);
    }

    toast.success(`Sale ${sale.invoice_number ?? ""} recorded · ${formatCurrency(total)}`, {
      action: {
        label: "Download invoice",
        onClick: () => downloadInvoice(sale.id),
      },
    });

    // reset
    setProductId(""); setQuantity("1"); setAmountPaid(""); setDiscount("");
    setCustomerName(""); setPhone(""); setNote("");
    setSaving(false);
  }

  async function downloadInvoice(saleId: string) {
    try {
      const res = await generate({ data: { saleId } });
      downloadBase64Pdf(res.base64, res.filename);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate invoice");
    }
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Record a sale" description="Log every sale to keep stock and profit accurate." />

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2 pb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Receipt className="h-4.5 w-4.5" />
              </span>
              <h2 className="text-base font-semibold">Sale details</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Product *</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                  <SelectContent>
                    {products.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No products yet</div>}
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={Number(p.stock) <= 0}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span>{p.name}</span>
                          <span className={`text-xs ${Number(p.stock) <= 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                            {Number(p.stock) <= 0 ? "Out of stock" : `${Number(p.stock)} left`}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {overStock && (
                  <p className="flex items-center gap-1.5 text-xs text-rose-500">
                    <AlertTriangle className="h-3.5 w-3.5" /> Only {product && Number(product.stock)} in stock
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Payment method *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank transfer</SelectItem>
                    <SelectItem value="credit">Credit (unpaid)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Discount</Label>
                <Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Amount paid</Label>
                <Input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0.00" />
              </div>

              <div className="space-y-2">
                <Label>Sale date</Label>
                <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Customer name</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in customer" />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Transaction note</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for this sale" />
              </div>
            </div>
          </Card>

          {/* Summary */}
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-muted-foreground">Summary</h3>
              <dl className="mt-4 space-y-2.5 text-sm">
                <Row label="Unit price" value={formatCurrency(unitPrice)} />
                <Row label="Subtotal" value={formatCurrency(subtotal)} />
                <Row label="Discount" value={`- ${formatCurrency(disc)}`} muted />
                <div className="border-t border-border pt-2.5">
                  <Row label="Total" value={formatCurrency(total)} bold />
                </div>
                <Row label="Amount paid" value={formatCurrency(paid)} muted />
                <Row label="Balance due" value={formatCurrency(balance)} bold accent={balance > 0 ? "warn" : "ok"} />
                <div className="border-t border-border pt-2.5">
                  <Row label="Profit" value={formatCurrency(profit)} bold accent="ok" />
                </div>
              </dl>
              <Button
                onClick={record}
                disabled={saving || !product || qty <= 0 || outOfStock || overStock}
                className="mt-5 w-full"
                size="lg"
              >
                <Receipt className="mr-2 h-4 w-4" />
                {saving ? "Recording…" : "Record Sale"}
              </Button>
            </Card>

            <Card className="p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <History className="h-4 w-4" /> Recent sales
              </h3>
              <ul className="mt-3 divide-y divide-border">
                {recent.length === 0 && <p className="py-3 text-xs text-muted-foreground">No sales yet</p>}
                {recent.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.invoice_number ?? s.id.slice(0, 8)}</p>
                      <p className="truncate text-xs text-muted-foreground">{s.customer_name || "Walk-in"} · {new Date(s.sale_date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{formatCurrency(Number(s.total))}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadInvoice(s.id)} title="Download invoice">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value, bold, muted, accent }: { label: string; value: string; bold?: boolean; muted?: boolean; accent?: "ok" | "warn" }) {
  const valColor = accent === "ok" ? "text-emerald-500" : accent === "warn" ? "text-amber-500" : bold ? "text-foreground" : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? "text-muted-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={`${bold ? "font-semibold" : ""} ${valColor}`}>{value}</dd>
    </div>
  );
}
