import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Printer, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { generateInvoicePdf } from "@/server/invoices.functions";
import { downloadBase64Pdf } from "@/lib/download";
import { toast } from "sonner";

type Sale = {
  id: string; invoice_number: string | null; total: number; cost_total: number;
  discount: number; amount_paid: number; payment_method: string;
  customer_name: string | null; note: string | null; sale_date: string;
};
type Item = { product_name: string; quantity: number; unit_price: number };
type Profile = {
  business_name: string | null; logo_url: string | null; email: string | null;
  phone: string | null; location: string | null; currency: string;
};

export function InvoicePreviewDialog({
  saleId, open, onOpenChange,
}: { saleId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const generate = useServerFn(generateInvoicePdf);

  useEffect(() => {
    if (!open || !saleId || !user) return;
    setLoading(true);
    (async () => {
      const [{ data: s }, { data: it }, { data: p }] = await Promise.all([
        supabase.from("sales").select("*").eq("id", saleId).maybeSingle(),
        supabase.from("sale_items").select("product_name,quantity,unit_price").eq("sale_id", saleId),
        supabase.from("profiles").select("business_name,logo_url,email,phone,location,currency").eq("id", user.id).maybeSingle(),
      ]);
      setSale(s as Sale | null);
      setItems((it as Item[]) ?? []);
      setProfile(p as Profile | null);
      setLoading(false);
    })();
  }, [open, saleId, user]);

  async function download() {
    if (!saleId) return;
    setDownloading(true);
    try {
      const res = await generate({ data: { saleId } });
      downloadBase64Pdf(res.base64, res.filename);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate invoice");
    } finally {
      setDownloading(false);
    }
  }

  function print() {
    const node = document.getElementById("invoice-preview-printable");
    if (!node) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<html><head><title>${sale?.invoice_number ?? "Invoice"}</title>
      <style>
        body { font-family: -apple-system, system-ui, sans-serif; padding: 24px; color: #1f2937; }
        h1,h2,h3 { margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e7eb; }
        th { background:#f3f4f6; font-size: 12px; text-transform: uppercase; color:#6b7280; }
        .totals { margin-top: 16px; width: 280px; margin-left: auto; }
        .totals div { display:flex; justify-content: space-between; padding:4px 0; }
        .muted { color:#6b7280; font-size: 12px; }
        .header { display:flex; justify-content: space-between; align-items:flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
        img.logo { max-height:60px; max-width:120px; object-fit:contain; }
      </style></head><body>${node.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  }

  const currency = profile?.currency ?? "GHS";
  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const balance = sale ? Math.max(0, Number(sale.total) - Number(sale.amount_paid || 0)) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice preview</DialogTitle>
        </DialogHeader>
        {loading || !sale ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : (
          <>
            <div id="invoice-preview-printable" className="rounded-xl border border-border bg-background p-6">
              <div className="header flex items-start justify-between border-b-2 border-primary pb-3">
                <div className="flex items-start gap-3">
                  {profile?.logo_url ? (
                    <img src={profile.logo_url} alt="logo" className="logo h-14 w-auto max-w-[120px] object-contain" />
                  ) : null}
                  <div>
                    <h2 className="text-lg font-bold">{profile?.business_name || "Your Business"}</h2>
                    {profile?.email && <p className="muted text-xs text-muted-foreground">{profile.email}</p>}
                    {profile?.phone && <p className="muted text-xs text-muted-foreground">{profile.phone}</p>}
                    {profile?.location && <p className="muted text-xs text-muted-foreground">{profile.location}</p>}
                  </div>
                </div>
                <div className="text-right">
                  <h1 className="text-xl font-bold tracking-tight text-primary">INVOICE</h1>
                  <p className="muted mt-1 text-xs text-muted-foreground">#{sale.invoice_number ?? sale.id.slice(0, 8)}</p>
                  <p className="muted text-xs text-muted-foreground">{new Date(sale.sale_date).toLocaleDateString()}</p>
                  <p className="muted text-xs capitalize text-muted-foreground">{sale.payment_method.replace("_", " ")}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className="muted text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bill to</p>
                <p className="font-medium">{sale.customer_name || "Walk-in customer"}</p>
              </div>

              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr>
                    <th className="border-b bg-muted/40 px-2 py-2 text-left text-[11px] font-medium uppercase text-muted-foreground">Item</th>
                    <th className="border-b bg-muted/40 px-2 py-2 text-right text-[11px] font-medium uppercase text-muted-foreground">Qty</th>
                    <th className="border-b bg-muted/40 px-2 py-2 text-right text-[11px] font-medium uppercase text-muted-foreground">Unit price</th>
                    <th className="border-b bg-muted/40 px-2 py-2 text-right text-[11px] font-medium uppercase text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-b border-border/60">
                      <td className="px-2 py-2">{it.product_name}</td>
                      <td className="px-2 py-2 text-right">{Number(it.quantity)}</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(Number(it.unit_price), currency)}</td>
                      <td className="px-2 py-2 text-right">{formatCurrency(Number(it.quantity) * Number(it.unit_price), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="totals ml-auto mt-4 w-full max-w-[280px] space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal, currency)}</span></div>
                {Number(sale.discount) > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− {formatCurrency(Number(sale.discount), currency)}</span></div>
                )}
                <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="text-primary">{formatCurrency(Number(sale.total), currency)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount paid</span><span>{formatCurrency(Number(sale.amount_paid || 0), currency)}</span></div>
                <div className="flex justify-between font-semibold"><span>Balance due</span><span className={balance > 0 ? "text-amber-500" : "text-emerald-500"}>{formatCurrency(balance, currency)}</span></div>
              </div>

              {sale.note && (
                <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs">
                  <span className="muted font-semibold text-muted-foreground">Note: </span>{sale.note}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}><X className="mr-1 h-4 w-4" />Close</Button>
              <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" />Print</Button>
              <Button onClick={download} disabled={downloading}>
                <Download className="mr-1 h-4 w-4" />{downloading ? "Preparing…" : "Download PDF"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
