import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/constants';
import { Package, CheckCircle2, Circle, Clock, Truck, PackageCheck, XCircle } from 'lucide-react';
import { Logo } from '@/components/Logo';

type OrderData = {
  tracking_code: string;
  status: string;
  payment_status: string;
  customer_name: string;
  total: number;
  subtotal: number;
  discount: number;
  order_date: string;
  delivered_at: string | null;
  estimated_delivery_date: string | null;
  carrier_name: string | null;
  carrier_phone: string | null;
  tracking_notes: string | null;
  delivery_location: string | null;
  notes: string | null;
  items: { name: string; quantity: number; unit_price: number; line_total: number }[];
  business: { name: string; logo_url: string | null; phone: string | null; slug: string | null };
};

const TIMELINE_STEPS: { key: string; label: string }[] = [
  { key: 'pending', label: 'Order Received' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TrackOrderPage() {
  const { code = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderData | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('public_get_order_by_tracking' as any, { _code: code });
    if (error || !data) setOrder(null);
    else setOrder(data as OrderData);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [code]);

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

  const isCancelled = order.status === 'cancelled';
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.key === order.status);

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
        {/* Status header */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              {isCancelled ? <XCircle className="h-8 w-8 text-destructive" /> : <Clock className="h-8 w-8 text-primary" />}
              <div>
                <p className="text-sm text-muted-foreground">Current status</p>
                <p className="text-xl font-semibold">{statusLabel(order.status)}</p>
              </div>
            </div>
            {order.estimated_delivery_date && !isCancelled ? (
              <p className="text-sm text-muted-foreground mt-3">
                Estimated delivery: <span className="font-medium text-foreground">{new Date(order.estimated_delivery_date).toLocaleDateString()}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Timeline */}
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
                      {done ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0 mt-0.5" />
                      )}
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

        {/* Items */}
        <Card>
          <CardContent className="p-5">
            <p className="text-sm font-medium mb-3">Items</p>
            <div className="space-y-2">
              {order.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{it.quantity}× {it.name}</span>
                  <span className="font-medium">{formatCurrency(Number(it.line_total))}</span>
                </div>
              ))}
              <div className="border-t border-border pt-2 mt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatCurrency(Number(order.total))}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Payment status: {statusLabel(order.payment_status)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Details */}
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
