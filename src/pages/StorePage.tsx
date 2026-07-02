import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/constants';
import { Minus, Plus, ShoppingCart, Trash2, Package, ArrowLeft, CheckCircle2, Truck, Store as StoreIcon } from 'lucide-react';
import { Logo } from '@/components/Logo';

type Product = {
  id: string;
  name: string;
  online_description: string | null;
  price: number;
  stock: number | null;
  available: boolean;
  image_url: string | null;
  category: string | null;
};
type Business = {
  name: string;
  logo_url: string | null;
  phone: string | null;
  location: string | null;
  slug: string;
  show_stock: boolean;
  enable_notes: boolean;
  enable_delivery_address: boolean;
  enable_product_images: boolean;
  payment_methods: string[];
  payment_instructions: string | null;
  default_delivery_fee: number;
  allow_pickup: boolean;
  allow_delivery: boolean;
};

type CartItem = { product_id: string; quantity: number };

export default function StorePage() {
  const { slug = '' } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState<Business | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [fulfillment, setFulfillment] = useState<'delivery' | 'pickup'>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'paystack'>('cash_on_delivery');
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    delivery_location: '',
    notes: '',
    payment_name: '',
    payment_reference: '',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('public_get_store' as any, { _slug: slug });
      if (cancelled) return;
      if (error || !data) {
        setBusiness(null);
        setProducts([]);
      } else {
        const biz = (data as any).business as Business;
        setBusiness(biz);
        setProducts(((data as any).products || []) as Product[]);
        // Pick sensible defaults
        if (biz.allow_delivery === false && biz.allow_pickup) setFulfillment('pickup');
        else setFulfillment('delivery');
        const methods = biz.payment_methods || ['cash_on_delivery'];
        setPaymentMethod(methods.includes('cash_on_delivery') ? 'cash_on_delivery' : (methods[0] as any) || 'cash_on_delivery');
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([pid, qty]) => {
        const p = products.find((x) => x.id === pid);
        return p ? { product: p, quantity: qty } : null;
      })
      .filter((x): x is { product: Product; quantity: number } => !!x);
  }, [cart, products]);

  const cartCount = cartItems.reduce((s, i) => s + i.quantity, 0);
  const cartSubtotal = cartItems.reduce((s, i) => s + i.quantity * Number(i.product.price || 0), 0);
  const deliveryFee = fulfillment === 'delivery' ? Number(business?.default_delivery_fee || 0) : 0;
  const cartTotal = cartSubtotal + deliveryFee;

  const addToCart = (p: Product) => setCart((c) => ({ ...c, [p.id]: (c[p.id] || 0) + 1 }));
  const setQty = (id: string, qty: number) => {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || cartItems.length === 0) return;
    if (!form.customer_name.trim() || !form.customer_phone.trim()) {
      toast({ title: 'Missing information', description: 'Please enter your name and phone number.', variant: 'destructive' });
      return;
    }
    if (fulfillment === 'delivery' && !form.delivery_location.trim()) {
      toast({ title: 'Delivery address required', description: 'Please enter where you want the order delivered.', variant: 'destructive' });
      return;
    }
    if (requirePaymentProof && (!form.payment_name.trim() || !form.payment_reference.trim())) {
      toast({ title: 'Payment details required', description: 'Please enter the Momo name and reference used for payment.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const items: CartItem[] = cartItems.map((i) => ({ product_id: i.product.id, quantity: i.quantity }));
      const { data, error } = await supabase.functions.invoke('submit-public-order', {
        body: {
          slug,
          customer_name: form.customer_name.trim(),
          customer_phone: form.customer_phone.trim(),
          delivery_location: fulfillment === 'delivery' ? form.delivery_location.trim() : '',
          notes: form.notes.trim(),
          fulfillment_type: fulfillment,
          payment_method: paymentMethod,
          payment_name: form.payment_name.trim() || undefined,
          payment_reference: form.payment_reference.trim() || undefined,
          items,
        },
      });
      if (error) throw error;
      const res = data as { ok: boolean; tracking_code?: string; reason?: string };
      if (!res.ok || !res.tracking_code) throw new Error(res.reason || 'Could not place order.');
      setSuccessCode(res.tracking_code);
      setCart({});
      setCheckoutOpen(false);
    } catch (err) {
      toast({ title: 'Could not place order', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading store…</div>;
  if (!business) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <Package className="h-12 w-12 text-muted-foreground mb-3" />
        <h1 className="text-xl font-semibold">Store not found</h1>
        <p className="text-sm text-muted-foreground mt-2">This store link is invalid or online ordering is disabled.</p>
      </div>
    );
  }

  if (successCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
            <h1 className="text-2xl font-semibold">Order placed!</h1>
            <p className="text-sm text-muted-foreground">
              Your order number is <span className="font-mono font-semibold text-foreground">{successCode}</span>.
              We've sent you an SMS with a tracking link.
            </p>
            <Link to={`/track/${successCode}`} className="block">
              <Button className="w-full">Track my order</Button>
            </Link>
            <button
              className="text-sm text-muted-foreground underline underline-offset-2"
              onClick={() => setSuccessCode(null)}
            >
              Back to store
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const paymentMethods = business.payment_methods || ['cash_on_delivery'];
  const showPaymentChoice = paymentMethods.length > 1;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 sticky top-0 z-10 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {business.logo_url ? (
              <img src={business.logo_url} alt={business.name} className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <Logo className="h-10 w-10" />
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">{business.name}</h1>
              {business.location ? <p className="text-xs text-muted-foreground truncate">{business.location}</p> : null}
            </div>
          </div>
          <Button onClick={() => setCheckoutOpen(true)} disabled={cartCount === 0} className="shrink-0">
            <ShoppingCart className="mr-2 h-4 w-4" />
            {cartCount > 0 ? `${cartCount} · ${formatCurrency(cartSubtotal)}` : 'Cart'}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {checkoutOpen ? (
          <Card>
            <CardContent className="p-5 space-y-5">
              <button className="flex items-center text-sm text-muted-foreground" onClick={() => setCheckoutOpen(false)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to products
              </button>
              <h2 className="text-xl font-semibold">Your cart</h2>
              <div className="space-y-3">
                {cartItems.map(({ product, quantity }) => (
                  <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                    <div className="h-14 w-14 rounded-xl bg-muted overflow-hidden flex items-center justify-center">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{product.name}</p>
                      <p className="text-sm text-muted-foreground">{formatCurrency(Number(product.price))}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" onClick={() => setQty(product.id, quantity - 1)}><Minus className="h-3 w-3" /></Button>
                      <span className="min-w-[2ch] text-center">{quantity}</span>
                      <Button variant="outline" size="icon" onClick={() => setQty(product.id, quantity + 1)}><Plus className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setQty(product.id, 0)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={submit} className="space-y-4 pt-2">
                {/* Fulfillment choice */}
                {business.allow_pickup && business.allow_delivery ? (
                  <div className="space-y-2">
                    <Label>How would you like to receive your order?</Label>
                    <RadioGroup value={fulfillment} onValueChange={(v) => setFulfillment(v as any)} className="grid grid-cols-2 gap-3">
                      <label className={`flex items-center gap-2 rounded-xl border p-3 cursor-pointer ${fulfillment === 'delivery' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                        <RadioGroupItem value="delivery" id="fx-delivery" />
                        <Truck className="h-4 w-4" />
                        <span className="text-sm">Delivery</span>
                      </label>
                      <label className={`flex items-center gap-2 rounded-xl border p-3 cursor-pointer ${fulfillment === 'pickup' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                        <RadioGroupItem value="pickup" id="fx-pickup" />
                        <StoreIcon className="h-4 w-4" />
                        <span className="text-sm">Pickup</span>
                      </label>
                    </RadioGroup>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Full name *</Label>
                    <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} required maxLength={120} />
                  </div>
                  <div>
                    <Label>Phone number *</Label>
                    <Input type="tel" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} placeholder="+233..." required />
                  </div>
                </div>

                {fulfillment === 'delivery' ? (
                  <div>
                    <Label>Delivery address *</Label>
                    <Input value={form.delivery_location} onChange={(e) => setForm({ ...form, delivery_location: e.target.value })} required maxLength={500} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                    <p className="font-medium flex items-center gap-2"><StoreIcon className="h-4 w-4" /> Pickup at store</p>
                    {business.location ? <p className="text-xs text-muted-foreground mt-1">{business.location}</p> : null}
                  </div>
                )}

                <div>
                  <Label>Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} maxLength={1000} />
                </div>

                {showPaymentChoice ? (
                  <div className="space-y-2">
                    <Label>Payment method</Label>
                    <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)} className="grid gap-2">
                      {paymentMethods.includes('cash_on_delivery') ? (
                        <label className={`flex items-center gap-2 rounded-xl border p-3 cursor-pointer ${paymentMethod === 'cash_on_delivery' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                          <RadioGroupItem value="cash_on_delivery" id="pm-cod" />
                          <span className="text-sm">Cash on delivery / pickup</span>
                        </label>
                      ) : null}
                      {paymentMethods.includes('paystack') ? (
                        <label className={`flex items-center gap-2 rounded-xl border p-3 cursor-pointer ${paymentMethod === 'paystack' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                          <RadioGroupItem value="paystack" id="pm-ps" />
                          <span className="text-sm">Pay online (Paystack) — the store will send you a payment link</span>
                        </label>
                      ) : null}
                    </RadioGroup>
                  </div>
                ) : null}

                {business.payment_instructions ? (
                  <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                    {business.payment_instructions}
                  </div>
                ) : null}

                {/* Totals */}
                <div className="rounded-xl border border-border p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(cartSubtotal)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery fee</span>
                    <span>{fulfillment === 'delivery' ? formatCurrency(deliveryFee) : '—'}</span>
                  </div>
                  <div className="flex justify-between font-semibold pt-1 border-t border-border">
                    <span>Total</span><span>{formatCurrency(cartTotal)}</span>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Placing order…' : `Place order · ${formatCurrency(cartTotal)}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3" />
            <p>No products available yet. Please check back later.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => {
              const qty = cart[p.id] || 0;
              const outOfStock = p.available === false || (business.show_stock && p.stock !== null && Number(p.stock) <= 0);
              return (
                <Card key={p.id} className="overflow-hidden">
                  {business.enable_product_images ? (
                    <div className="aspect-square bg-muted flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-10 w-10 text-muted-foreground" />
                      )}
                    </div>
                  ) : null}
                  <CardContent className="p-3 space-y-2">
                    <div>
                      <p className="font-medium leading-tight">{p.name}</p>
                      {p.online_description ? <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.online_description}</p> : null}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{formatCurrency(Number(p.price))}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${outOfStock ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-700 dark:text-green-400'}`}>
                        {outOfStock ? 'Out of stock' : 'Available'}
                      </span>
                    </div>
                    {outOfStock ? (
                      <Button disabled variant="outline" className="w-full" size="sm">Out of stock</Button>
                    ) : qty > 0 ? (
                      <div className="flex items-center justify-between gap-2">
                        <Button variant="outline" size="icon" onClick={() => setQty(p.id, qty - 1)}><Minus className="h-3 w-3" /></Button>
                        <span className="font-medium">{qty}</span>
                        <Button variant="outline" size="icon" onClick={() => setQty(p.id, qty + 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <Button onClick={() => addToCart(p)} className="w-full" size="sm">
                        <Plus className="mr-1 h-3 w-3" /> Add
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
