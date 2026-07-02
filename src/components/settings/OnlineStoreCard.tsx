import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Copy, ExternalLink, Store } from 'lucide-react';

type Prefs = {
  online_ordering_enabled: boolean;
  store_slug: string | null;
  store_show_stock: boolean;
  store_enable_notes: boolean;
  store_enable_delivery_address: boolean;
  store_enable_product_images: boolean;
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
  sms_notify_new_order: true,
  sms_notify_order_status: true,
};

export function OnlineStoreCard() {
  const { user, effectiveBusinessOwnerId } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const ownerId = effectiveBusinessOwnerId ?? user?.id ?? null;

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('online_ordering_enabled, store_slug, store_show_stock, store_enable_notes, store_enable_delivery_address, store_enable_product_images, sms_notify_new_order, sms_notify_order_status')
        .eq('id', ownerId)
        .maybeSingle();
      if (data) setPrefs({ ...DEFAULT_PREFS, ...(data as any) });
      setLoading(false);
    })();
  }, [ownerId]);

  const update = async (patch: Partial<Prefs>) => {
    if (!ownerId) return;
    setSaving(true);
    const optimistic = { ...prefs, ...patch };
    setPrefs(optimistic);
    const { error } = await supabase.from('profiles').update(patch as any).eq('id', ownerId);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      // reload
      const { data } = await supabase.from('profiles').select('*').eq('id', ownerId).maybeSingle();
      if (data) setPrefs({ ...DEFAULT_PREFS, ...(data as any) });
    }
  };

  const storeUrl = prefs.store_slug ? `${window.location.origin}/store/${prefs.store_slug}` : '';

  const copyLink = async () => {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Store className="h-4 w-4" /> Online Ordering
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <Label className="font-medium">Enable Online Ordering</Label>
            <p className="text-xs text-muted-foreground">Publish your public store link so customers can browse and order.</p>
          </div>
          <Switch
            checked={prefs.online_ordering_enabled}
            onCheckedChange={(v) => update({ online_ordering_enabled: v })}
            disabled={loading || saving}
          />
        </div>

        {prefs.online_ordering_enabled ? (
          <>
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Public store link</Label>
              <div className="flex items-center gap-2">
                <Input value={storeUrl} readOnly className="text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copyLink} title="Copy link">
                  <Copy className="h-4 w-4" />
                </Button>
                <a href={storeUrl} target="_blank" rel="noreferrer">
                  <Button type="button" variant="outline" size="icon" title="Open">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                Turn products on individually via Products → "Available for online ordering".
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow label="Show product images" v={prefs.store_enable_product_images} onChange={(v) => update({ store_enable_product_images: v })} />
              <ToggleRow label="Show available stock" v={prefs.store_show_stock} onChange={(v) => update({ store_show_stock: v })} />
              <ToggleRow label="Allow customer notes" v={prefs.store_enable_notes} onChange={(v) => update({ store_enable_notes: v })} />
              <ToggleRow label="Require delivery address" v={prefs.store_enable_delivery_address} onChange={(v) => update({ store_enable_delivery_address: v })} />
              <ToggleRow label="SMS on new order" v={prefs.sms_notify_new_order} onChange={(v) => update({ sms_notify_new_order: v })} />
              <ToggleRow label="SMS on status update" v={prefs.sms_notify_order_status} onChange={(v) => update({ sms_notify_order_status: v })} />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
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
