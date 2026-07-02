// Owner-facing Order Settings dialog: houses online-ordering toggle, store
// options, delivery fee, and payment method configuration. This replaces the
// old "OnlineStoreCard" that lived under Settings > Profile.
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Copy, ExternalLink, Settings, Store } from 'lucide-react';

type Prefs = {
  online_ordering_enabled: boolean;
  store_slug: string | null;
  store_show_stock: boolean;
  store_enable_notes: boolean;
  store_enable_delivery_address: boolean;
  store_enable_product_images: boolean;
  store_allow_pickup: boolean;
  store_allow_delivery: boolean;
  store_default_delivery_fee: number;
  orders_auto_publish_products: boolean;
  store_payment_methods: string[];
  store_payment_instructions: string | null;
  sms_notify_new_order: boolean;
  sms_notify_order_status: boolean;
};

const DEFAULT_PREFS: Prefs = {
  online_ordering_enabled: false,
  store_slug: null,
  store_show_stock: true,
  store_enable_notes: true,
  store_enable_delivery_address: true,
  store_enable_product_images: true,
  store_allow_pickup: true,
  store_allow_delivery: true,
  store_default_delivery_fee: 0,
  orders_auto_publish_products: true,
  store_payment_methods: ['cash_on_delivery'],
  store_payment_instructions: null,
  sms_notify_new_order: true,
  sms_notify_order_status: true,
};

export function OrderSettingsDialog() {
  const { user, effectiveBusinessOwnerId } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState('0');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const ownerId = effectiveBusinessOwnerId ?? user?.id ?? null;

  const reload = async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('online_ordering_enabled, store_slug, store_show_stock, store_enable_notes, store_enable_delivery_address, store_enable_product_images, store_allow_pickup, store_allow_delivery, store_default_delivery_fee, orders_auto_publish_products, store_payment_methods, store_payment_instructions, sms_notify_new_order, sms_notify_order_status')
      .eq('id', ownerId)
      .maybeSingle();
    if (data) {
      const merged = { ...DEFAULT_PREFS, ...(data as any) };
      setPrefs(merged);
      setDeliveryFeeInput(String(merged.store_default_delivery_fee ?? 0));
      setPaymentInstructions(String(merged.store_payment_instructions ?? ''));
    }
    setLoading(false);
  };

  useEffect(() => { if (open) void reload(); }, [open, ownerId]);

  const patch = async (p: Partial<Prefs>) => {
    if (!ownerId) return;
    setSaving(true);
    const optimistic = { ...prefs, ...p };
    setPrefs(optimistic);
    const { error } = await supabase.from('profiles').update(p as any).eq('id', ownerId);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      void reload();
    }
  };

  const togglePaymentMethod = (m: string, checked: boolean) => {
    let next = new Set(prefs.store_payment_methods || []);
    if (checked) next.add(m); else next.delete(m);
    if (next.size === 0) next.add('cash_on_delivery'); // always keep at least one
    void patch({ store_payment_methods: Array.from(next) });
  };

  const saveDeliveryFee = () => {
    const n = Math.max(0, Number(deliveryFeeInput || 0));
    void patch({ store_default_delivery_fee: n });
  };

  const savePaymentInstructions = () => {
    void patch({ store_payment_instructions: paymentInstructions.trim() || null });
  };

  const storeUrl = prefs.store_slug ? `${window.location.origin}/store/${prefs.store_slug}` : '';
  const copyLink = async () => {
    if (!storeUrl) return;
    try { await navigator.clipboard.writeText(storeUrl); toast({ title: 'Link copied' }); }
    catch { toast({ title: 'Could not copy', variant: 'destructive' }); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" /> Order Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Store className="h-4 w-4" /> Order & Online Store Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 text-sm">
          {/* Online ordering master toggle */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Enable Online Ordering</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Publish your public store link so customers can browse and order.</p>
              </div>
              <Switch checked={prefs.online_ordering_enabled} onCheckedChange={(v) => patch({ online_ordering_enabled: v })} disabled={loading || saving} />
            </div>
            {prefs.online_ordering_enabled ? (
              <div className="mt-3 space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Public store link</Label>
                <div className="flex items-center gap-2">
                  <Input value={storeUrl} readOnly className="text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={copyLink} title="Copy link"><Copy className="h-4 w-4" /></Button>
                  <a href={storeUrl} target="_blank" rel="noreferrer">
                    <Button type="button" variant="outline" size="icon" title="Open"><ExternalLink className="h-4 w-4" /></Button>
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          {prefs.online_ordering_enabled ? (
            <>
              {/* Auto-publish */}
              <div className="rounded-xl border border-border p-4 flex items-center justify-between">
                <div>
                  <Label className="font-medium">Auto-publish all products</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">When enabled, every product with stock is available on the store. Out-of-stock items show automatically.</p>
                </div>
                <Switch checked={prefs.orders_auto_publish_products} onCheckedChange={(v) => patch({ orders_auto_publish_products: v })} disabled={saving} />
              </div>

              {/* Fulfillment options */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="font-medium">Fulfillment options</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ToggleRow label="Allow delivery" v={prefs.store_allow_delivery} onChange={(v) => patch({ store_allow_delivery: v })} />
                  <ToggleRow label="Allow pickup" v={prefs.store_allow_pickup} onChange={(v) => patch({ store_allow_pickup: v })} />
                </div>
                {prefs.store_allow_delivery ? (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Label>Default delivery fee (GHS)</Label>
                      <Input type="number" min="0" step="0.01" value={deliveryFeeInput} onChange={(e) => setDeliveryFeeInput(e.target.value)} />
                    </div>
                    <Button type="button" onClick={saveDeliveryFee} disabled={saving}>Save fee</Button>
                  </div>
                ) : null}
              </div>

              {/* Payment methods */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="font-medium">Accepted payment methods</p>
                <div className="grid gap-2">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={prefs.store_payment_methods.includes('cash_on_delivery')}
                      onCheckedChange={(c) => togglePaymentMethod('cash_on_delivery', !!c)}
                    />
                    <span>Cash on delivery / pickup</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={prefs.store_payment_methods.includes('paystack')}
                      onCheckedChange={(c) => togglePaymentMethod('paystack', !!c)}
                    />
                    <span>Paystack (customer requests payment link)</span>
                  </label>
                </div>
                <div>
                  <Label>Payment instructions (shown to customers)</Label>
                  <Textarea rows={3} value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} placeholder="e.g. Send Mobile Money to 024 XXX XXXX and reply with the confirmation code." />
                  <div className="mt-2 flex justify-end">
                    <Button type="button" size="sm" variant="outline" onClick={savePaymentInstructions} disabled={saving}>Save instructions</Button>
                  </div>
                </div>
              </div>

              {/* Storefront presentation */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <p className="font-medium">Storefront options</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ToggleRow label="Show product images" v={prefs.store_enable_product_images} onChange={(v) => patch({ store_enable_product_images: v })} />
                  <ToggleRow label="Show available stock" v={prefs.store_show_stock} onChange={(v) => patch({ store_show_stock: v })} />
                  <ToggleRow label="Allow customer notes" v={prefs.store_enable_notes} onChange={(v) => patch({ store_enable_notes: v })} />
                  <ToggleRow label="Require delivery address" v={prefs.store_enable_delivery_address} onChange={(v) => patch({ store_enable_delivery_address: v })} />
                </div>
              </div>

              {/* SMS */}
              <div className="rounded-xl border border-border p-4 grid gap-2 sm:grid-cols-2">
                <ToggleRow label="SMS on new order" v={prefs.sms_notify_new_order} onChange={(v) => patch({ sms_notify_new_order: v })} />
                <ToggleRow label="SMS on status update" v={prefs.sms_notify_order_status} onChange={(v) => patch({ sms_notify_order_status: v })} />
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({ label, v, onChange }: { label: string; v: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
      <span>{label}</span>
      <Switch checked={v} onCheckedChange={onChange} />
    </div>
  );
}
