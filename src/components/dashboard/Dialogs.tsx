import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Product = { id: string; name: string; price: number; cost: number; stock: number };

export function AddProductDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("products").insert({
      user_id: user.id,
      name: name.trim(),
      price: parseFloat(price) || 0,
      cost: parseFloat(cost) || 0,
      stock: parseFloat(stock) || 0,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Product added");
    setName(""); setPrice(""); setCost(""); setStock("");
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add product</DialogTitle>
          <DialogDescription>Save it to your inventory. Stock is optional.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coca-Cola 350ml" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="p-price">Price</Label>
              <Input id="p-price" type="number" min="0" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-cost">Cost</Label>
              <Input id="p-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-stock">Stock</Label>
              <Input id="p-stock" type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving..." : "Save product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddSaleDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customer, setCustomer] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("products")
      .select("id, name, price, cost, stock")
      .eq("user_id", user.id)
      .order("name")
      .then(({ data }) => setProducts((data as Product[]) ?? []));
  }, [open, user]);

  useEffect(() => {
    const p = products.find((x) => x.id === productId);
    if (p) setUnitPrice(String(p.price));
  }, [productId, products]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const product = products.find((x) => x.id === productId);
    if (!product) return toast.error("Pick a product");
    const quantity = parseFloat(qty) || 0;
    const price = parseFloat(unitPrice) || 0;
    if (quantity <= 0 || price < 0) return toast.error("Enter a valid quantity and price");

    setSaving(true);
    const total = quantity * price;
    const costTotal = quantity * (product.cost || 0);
    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .insert({
        user_id: user.id,
        total,
        cost_total: costTotal,
        payment_method: paymentMethod,
        customer_name: customer.trim() || null,
      })
      .select("id")
      .single();

    if (saleErr || !sale) { setSaving(false); return toast.error(saleErr?.message ?? "Could not save sale"); }

    const { error: itemErr } = await supabase.from("sale_items").insert({
      sale_id: sale.id,
      user_id: user.id,
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: price,
      unit_cost: product.cost || 0,
    });

    setSaving(false);
    if (itemErr) return toast.error(itemErr.message);

    toast.success("Sale recorded");
    setProductId(""); setQty("1"); setUnitPrice(""); setCustomer("");
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a sale</DialogTitle>
          <DialogDescription>Pick a product and quantity. Stock updates automatically.</DialogDescription>
        </DialogHeader>
        {products.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            Add a product first, then come back to record sales.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="s-product">Product</Label>
              <select
                id="s-product"
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (stock: {p.stock})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="s-qty">Quantity</Label>
                <Input id="s-qty" type="number" min="0.01" step="0.01" required value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-price">Unit price</Label>
                <Input id="s-price" type="number" min="0" step="0.01" required value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="s-pm">Payment</Label>
                <select
                  id="s-pm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="cash">Cash</option>
                  <option value="mobile_money">Mobile money</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank transfer</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="s-cust">Customer (optional)</Label>
                <Input id="s-cust" value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
                {saving ? "Saving..." : "Save sale"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AddExpenseDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Supplies");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("expenses").insert({
      user_id: user.id,
      amount: parseFloat(amount) || 0,
      category,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Expense recorded");
    setAmount(""); setNote("");
    onSaved?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an expense</DialogTitle>
          <DialogDescription>Track money flowing out of your business.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-amount">Amount</Label>
              <Input id="e-amount" type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-cat">Category</Label>
              <select
                id="e-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {["Supplies","Rent","Utilities","Salary","Transport","Marketing","Other"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-note">Note (optional)</Label>
            <Input id="e-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it for?" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving..." : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
