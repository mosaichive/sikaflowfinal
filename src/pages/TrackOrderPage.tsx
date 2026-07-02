import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/constants';
import { Package, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { Logo } from '@/components/Logo';

type OrderData = {
  tracking_code: string;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  customer_name: string;
  total: number;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  fulfillment_type: string;
  order_date: string;
  delivered_at: string | null;
  estimated_delivery_date: string | null;
  customer_confirmed_at: string | null;
  carrier_name: string | null;
  carrier_phone: string | null;
  tracking_notes: string | null;
  delivery_location: string | null;
  notes: string | null;
  customer_payment_name: string | null;
  customer_payment_reference: string | null;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
  business: { name: string; logo_url: string | null; phone: string | null; slug: string | null };
};

const TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Order Received' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready_for_pickup', label: 'Ready' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(d: string | null) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; }
}

export default function TrackOrderPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sessionKey] = useState(`kt_order_${code}`);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('public_get_order_by_tracking' as any, { _code: code });
    if (error || !data) setOrder(null);
    else setOrder(data as OrderData);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [code]);

  // Order isolation: once completed & this tab has confirmed, block re-viewing details
  const wasConfirmedHere = typeof window !== 'undefined' && sessionStorage.getItem(sessionKey) === 'completed';

  const currentIndex = useMemo(() => {
    if (!order) return -1;
    // Treat 'confirmed' as 'processing' for timeline
    const s = order.status === 'confirmed' ? 'processing' : order.status;
    return TIMELINE_STEPS.findIndex((step) => step.key === s);
  }, [order]);

  const canConfirmReceipt = order
    && !order.customer_confirmed_at
    && order.status !== 'completed'
    && order.status !== 'cancelled'
    && ['delivered', 'out_for_delivery', 'ready_for_pickup'].includes(order.status);

  const confirmReceipt = async () => {
    if (!order) return;
    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke('confirm-order-receipt', {
        body: { code: order.tracking_code },
      });
      if (error) throw error;
      const res = data as { ok: boolean; reason?: string };
      if (!res.ok) throw new Error(res.reason || 'Could not confirm.');
      try { sessionStorage.setItem(sessionKey, 'completed'); } catch { /* ignore */ }
      toast({ title: 'Thanks!', description: 'The business has been notified. Redirecting…' });
      // Close session and send them back to the store (or home) after a moment
      setTimeout(() => {
        if (order.business.slug) navigate(`/store/${order.business.slug}`, { replace: true });
        else navigate('/', { replace: true });
      }, 1500);
    } catch (err) {
      toast({ title: 'Could not confirm', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading order…</div>;
  }
  if (!order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <Package className="h-12 w-12 text-muted-foreground mb-3" />
        <h1 className="text-xl font-semibold">Order not found</h1>
        <p className="text-sm text-muted-foreground mt-2">This tracking link is invalid or has expired.</p>
      </div>
    );
  }

  // Order isolation: if completed AND already confirmed in this session, hide details.
  if ((order.status === 'completed' || order.customer_confirmed_at) && wasConfirmedHere) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <CheckCircle2 className="h-14 w-14 text-green-600 mb-3" />
        <h1 className="text-xl font-semibold">Order completed</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-sm">
          This order has been completed. For your privacy the details are no longer visible here.
        </p>
        {order.business.slug ? (
          <Button className="mt-4" onClick={() => navigate(`/store/${order.business.slug}`)}>Back to store</Button>
        ) : null}
      </div>
    );
  }

  const isCancelled = order.status === 'cancelled';
  const isCompleted = order.status === 'completed' || !!order.customer_confirmed_at;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center gap-3">
          {order.business.logo_url ? (
            <img src={order.business.logo_url} alt={order.business.name} className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <Logo className="h-9 w-9" />
          )}
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground truncate">{order.business.name}</p>
            <h1 className="text-lg font-semibold">Order #{order.tracking_code}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 space-y-5">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              {isCancelled ? (
                <XCircle className="h-8 w-8 text-destructive" />
              ) : isCompleted ? (
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              ) : (
                <Clock className="h-8 w-8 text-primary" />
              )}
              <div>
                <p className="text-sm text-muted-foreground">Current status</p>
                <p className="text-xl font-semibold">{statusLabel(order.status)}</p>
              </div>
            </div>
            {order.estimated_delivery_date && !isCancelled ? (
              <p className="text-sm text-muted-foreground mt-3">
                {order.fulfillment_type === 'pickup' ? 'Ready by' : 'Delivery date'}:{' '}
                <span className="font-medium text-foreground">{fmtDate(order.estimated_delivery_date)}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        {!isCancelled ? (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm font-medium mb-4">Order progress</p>
              <ol className="space-y-3">
                {TIMELINE_STEPS.map((step, i) => {
                  const done = i <= currentIndex;
                  const current = i === currentIndex;
                  return (
                    <li key={step.key} className="flex items-start gap-3">
                      {done ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                        : <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0 mt-0.5" />}
                      <div>
                        <p className={done ? 'font-medium' : 'text-muted-foreground'}>{step.label}</p>
                        {current && step.key === 'out_for_delivery' && order.carrier_name ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Carrier: <span className="text-foreground">{order.carrier_name}</span>
                            {order.carrier_phone ? <> · {order.carrier_phone}</> : null}
                            {order.tracking_notes ? <> · {order.tracking_notes}</> : null}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        ) : null}

        {/* Receive confirmation */}
        {canConfirmReceipt ? (
          <Card className="border-green-500/40 bg-green-500/5">
            <CardContent className="p-5 space-y-3">
              <p className="font-medium">Have you received your order?</p>
              <p className="text-sm text-muted-foreground">Tap the button below once you have the order in hand. This will mark it as completed.</p>
              <Button className="w-full" onClick={confirmReceipt} disabled={confirming}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> {confirming ? 'Confirming…' : 'I have received my order'}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-medium mb-3">Items</p>
            <div className="space-y-2 text-sm">
              {order.items.map((it, i) => (
                <div key={i} className="flex justify-between">
                  <span>{it.quantity}× {it.name}</span>
                  <span className="font-medium">{formatCurrency(Number(it.line_total))}</span>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{formatCurrency(Number(order.subtotal))}</span>
                </div>
                {Number(order.discount) > 0 ? (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount</span><span>-{formatCurrency(Number(order.discount))}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery fee</span>
                  <span>{Number(order.delivery_fee) > 0 ? formatCurrency(Number(order.delivery_fee)) : '—'}</span>
                </div>
                <div className="flex justify-between font-semibold pt-1 border-t border-border">
                  <span>Total</span><span>{formatCurrency(Number(order.total))}</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground pt-1">
                Payment status: {statusLabel(order.payment_status)} · {order.fulfillment_type === 'pickup' ? 'Pickup' : 'Delivery'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-1 text-sm">
            <p><span className="text-muted-foreground">Customer:</span> {order.customer_name}</p>
            <p><span className="text-muted-foreground">Placed:</span> {new Date(order.order_date).toLocaleString()}</p>
            {order.delivery_location ? <p><span className="text-muted-foreground">Delivery:</span> {order.delivery_location}</p> : null}
            {order.notes ? <p><span className="text-muted-foreground">Notes:</span> {order.notes}</p> : null}
            {order.business.phone ? <p><span className="text-muted-foreground">Contact business:</span> {order.business.phone}</p> : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
