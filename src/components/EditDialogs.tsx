import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";

type Product = { id: string; name: string; price: number; cost: number; stock: number };
type SaleRow = {
  id: string; total: number; cost_total: number; payment_method: string;
  customer_name: string | null; sale_date: string; discount: number; amount_paid: number;
  note: string | null;
};
type SaleItem = { id: string; product_id: string | null; product_name: string; quantity: number; unit_price: number; unit_cost: number };

export function EditSaleDialog({
  saleId, open, onOpenChange,
}: { saleId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [originalProductId, setOriginalProductId] = useState<string | null>(null);
  const [originalQty, setOriginalQty] = useState(0);
  const [itemId, setItemId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [discount, setDiscount] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [unitCost, setUnitCost] = useState(0);
  const [unitPrice, setUnitPrice] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !saleId || !user) return;
    setLoading(true);
    (async () => {
      const [{ data: s }, { data: it }, { data: p }] = await Promise.all([
        supabase.from("sales").select("*").eq("id", saleId).maybeSingle(),
        supabase.from("sale_items").select("*").eq("sale_id", saleId).limit(1),
        supabase.from("products").select("id,name,price,cost,stock").eq("user_id", user.id).order("name"),
      ]);
      setProducts((p as Product[]) ?? []);
      const sale = s as SaleRow | null;
      const item = (it as SaleItem[] | null)?.[0] ?? null;
      if (sale) {
        setPaymentMethod(sale.payment_method);
        setAmountPaid(String(sale.amount_paid || ""));
        setDiscount(String(sale.discount || ""));
        setSaleDate(new Date(sale.sale_date).toISOString().slice(0, 10));
        setCustomerName(sale.customer_name ?? "");
        setNote(sale.note ?? "");
      }
      if (item) {
        setItemId(item.id);
        setProductId(item.product_id ?? "");
        setOriginalProductId(item.product_id ?? null);
        setOriginalQty(Number(item.quantity));
        setProductName(item.product_name);
        setQuantity(String(item.quantity));
        setUnitCost(Number(item.unit_cost));
        setUnitPrice(Number(item.unit_price));
      }
      setLoading(false);
    })();
  }, [open, saleId, user]);

  useEffect(() => {
    if (!productId) return;
    const p = products.find((x) => x.id === productId);
    if (p && p.id !== originalProductId) {
      setUnitPrice(Number(p.price));
      setUnitCost(Number(p.cost));
      setProductName(p.name);
    } else if (p && p.id === originalProductId) {
      // keep original unit price/cost; do nothing
    }
  }, [productId, products, originalProductId]);

  const qty = Math.max(0, parseFloat(quantity) || 0);
  const disc = Math.max(0, parseFloat(discount) || 0);
  const paid = Math.max(0, parseFloat(amountPaid) || 0);
  const subtotal = qty * unitPrice;
  const total = Math.max(0, subtotal - disc);
  const balance = Math.max(0, total - paid);

  const currentProduct = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const stockChange = productId === originalProductId ? qty - originalQty : qty;
  const insufficient = currentProduct ? stockChange > Number(currentProduct.stock) : false;

  async function save() {
    if (!user || !saleId) return;
    if (qty <= 0) return toast.error("Quantity must be greater than 0");
    if (insufficient) return toast.error("Not enough stock for this change");
    setSaving(true);

    if (itemId) {
      const { error: delErr } = await supabase.from("sale_items").delete().eq("sale_id", saleId);
      if (delErr) { setSaving(false); return toast.error(delErr.message); }
    }

    const { error: insErr } = await supabase.from("sale_items").insert([{
      sale_id: saleId, user_id: user.id,
      product_id: productId || null, product_name: productName,
      quantity: qty, unit_price: unitPrice, unit_cost: unitCost,
    }]);
    if (insErr) { setSaving(false); return toast.error(insErr.message); }

    const { error: upErr } = await supabase.from("sales").update({
      total, cost_total: qty * unitCost,
      discount: disc, amount_paid: paid,
      payment_method: paymentMethod,
      customer_name: customerName.trim() || null,
      sale_date: new Date(saleDate).toISOString(),
      note: note.trim() || null,
    }).eq("id", saleId);

    setSaving(false);
    if (upErr) return toast.error(upErr.message);
    toast.success("Sale updated");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit sale</DialogTitle>
          <DialogDescription>Changes update stock, totals and reports instantly.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder={productName || "Select product"} /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} <span className="ml-2 text-xs text-muted-foreground">({Number(p.stock)} left)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              {insufficient && <p className="text-xs text-rose-500">Not enough stock available</p>}
            </div>
            <div className="space-y-2">
              <Label>Payment method</Label>
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
              <Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Amount paid</Label>
              <Input type="number" min="0" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sale date</Label>
              <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Customer name</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Note</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-sm sm:col-span-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>− {formatCurrency(disc)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrency(total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Balance due</span><span>{formatCurrency(balance)}</span></div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ExpenseRow = { id: string; amount: number; category: string; note: string | null; expense_date: string };
const EXPENSE_CATEGORIES = ["Supplies", "Rent", "Utilities", "Salary", "Transport", "Marketing", "Other"];

export function EditExpenseDialog({
  expenseId, open, onOpenChange,
}: { expenseId: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Other");
  const [note, setNote] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !expenseId) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("expenses").select("*").eq("id", expenseId).maybeSingle();
      const e = data as ExpenseRow | null;
      if (e) {
        setAmount(String(e.amount));
        setCategory(e.category);
        setNote(e.note ?? "");
        setDate(new Date(e.expense_date).toISOString().slice(0, 10));
      }
      setLoading(false);
    })();
  }, [open, expenseId]);

  async function save() {
    if (!expenseId) return;
    setSaving(true);
    const { error } = await supabase.from("expenses").update({
      amount: parseFloat(amount) || 0,
      category, note: note.trim() || null,
      expense_date: new Date(date).toISOString(),
    }).eq("id", expenseId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Expense updated");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>Changes update reports and available money instantly.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
