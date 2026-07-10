import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';

type Plan = {
  id: string;
  tier: string;
  name: string;
  description: string;
  price_monthly: number;
  price_annual: number;
  features: string[];
  cta_label: string;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
};

export default function PricingManagementPage() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pricing_plans' as any)
      .select('*')
      .order('sort_order');
    if (error) toast({ title: 'Failed to load plans', description: error.message, variant: 'destructive' });
    setPlans(((data as any[]) ?? []).map((r) => ({ ...r, features: Array.isArray(r.features) ? r.features : [] })));
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const update = (id: string, patch: Partial<Plan>) => {
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const save = async (p: Plan) => {
    setSavingId(p.id);
    const { error } = await supabase.from('pricing_plans' as any).update({
      name: p.name,
      description: p.description,
      price_monthly: p.price_monthly,
      price_annual: p.price_annual,
      features: p.features,
      cta_label: p.cta_label,
      is_popular: p.is_popular,
      is_active: p.is_active,
      sort_order: p.sort_order,
    }).eq('id', p.id);
    setSavingId(null);
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Saved', description: `${p.name} updated. Applies to NEW subscriptions only.` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pricing Management</h1>
        <p className="text-sm text-muted-foreground">
          Edit plan pricing, features, and visibility. Changes apply to <span className="font-semibold text-foreground">new subscriptions only</span> — existing subscribers keep their current plan.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.id} className={p.is_popular ? 'border-primary' : ''}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base">
                <span>{p.name}</span>
                <div className="flex items-center gap-1">
                  {p.is_popular && <Badge className="text-[10px]">Popular</Badge>}
                  {!p.is_active && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
                </div>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{p.tier}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Display name</Label>
                <Input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea rows={2} value={p.description} onChange={(e) => update(p.id, { description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Monthly (GHS)</Label>
                  <Input type="number" min={0} value={p.price_monthly} onChange={(e) => update(p.id, { price_monthly: Number(e.target.value) })} />
                </div>
                <div>
                  <Label className="text-xs">Annual (GHS)</Label>
                  <Input type="number" min={0} value={p.price_annual} onChange={(e) => update(p.id, { price_annual: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Features (one per line)</Label>
                <Textarea
                  rows={7}
                  value={p.features.join('\n')}
                  onChange={(e) => update(p.id, { features: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
              <div>
                <Label className="text-xs">CTA label</Label>
                <Input value={p.cta_label} onChange={(e) => update(p.id, { cta_label: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <Label className="text-xs">Popular badge</Label>
                <Switch checked={p.is_popular} onCheckedChange={(v) => update(p.id, { is_popular: v })} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <Label className="text-xs">Active (visible on Pricing page)</Label>
                <Switch checked={p.is_active} onCheckedChange={(v) => update(p.id, { is_active: v })} />
              </div>
              <Button className="w-full" onClick={() => save(p)} disabled={savingId === p.id}>
                {savingId === p.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : <><Save className="mr-2 h-4 w-4" />Save changes</>}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
