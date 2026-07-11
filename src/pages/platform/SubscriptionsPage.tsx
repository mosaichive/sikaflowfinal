import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

type Row = {
  id: string;
  business_name: string | null;
  email: string | null;
  subscription_plan: string;
  subscription_status: string;
  subscription_end_date: string | null;
  trial_end_date: string | null;
};

type PricingPlan = {
  tier: 'starter' | 'business' | 'business_plus';
  name: string;
  price_monthly: number;
  price_annual: number;
};

// Legacy plans stay selectable so historical/grandfathered subscribers can be adjusted.
const LEGACY_PLANS: Array<{ value: string; label: string; price: number; days: number | null; status: string }> = [
  { value: 'trial', label: 'Free Trial (30 days)', price: 0, days: 30, status: 'trial' },
  { value: 'monthly', label: 'Legacy Monthly — GH₵50', price: 50, days: 30, status: 'active' },
  { value: 'annual', label: 'Legacy Annual — GH₵500', price: 500, days: 365, status: 'active' },
  { value: 'lifetime', label: 'Lifetime', price: 0, days: null, status: 'lifetime' },
];

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [pricing, setPricing] = useState<PricingPlan[]>([]);
  const [planChange, setPlanChange] = useState<{ id: string; name: string } | null>(null);
  const [newPlan, setNewPlan] = useState<string>('business');
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id,business_name,email,subscription_plan,subscription_status,subscription_end_date,trial_end_date')
      .order('updated_at', { ascending: false });
    setRows((data as Row[]) ?? []);
  }, []);

  const loadPricing = useCallback(async () => {
    const { data } = await supabase
      .from('pricing_plans' as any)
      .select('tier,name,price_monthly,price_annual,sort_order')
      .order('sort_order');
    setPricing(((data as any[]) ?? []).map((r) => ({
      tier: r.tier, name: r.name,
      price_monthly: Number(r.price_monthly), price_annual: Number(r.price_annual),
    })));
  }, []);

  useEffect(() => {
    void load();
    void loadPricing();
    const ch = supabase.channel('platform-subs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_plans' }, () => void loadPricing())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load, loadPricing]);

  const priceFor = (plan: string, c: 'monthly' | 'annual'): number => {
    const tier = pricing.find((p) => p.tier === plan);
    if (tier) return c === 'annual' ? tier.price_annual : tier.price_monthly;
    return LEGACY_PLANS.find((l) => l.value === plan)?.price ?? 0;
  };

  const isTiered = useMemo(() => pricing.some((p) => p.tier === newPlan), [pricing, newPlan]);

  const setPlan = async () => {
    if (!planChange) return;
    setBusy(true);
    const now = new Date();
    const payload: any = { subscription_plan: newPlan };

    const tierMatch = pricing.find((p) => p.tier === newPlan);
    const legacyMatch = LEGACY_PLANS.find((l) => l.value === newPlan);

    if (tierMatch) {
      const days = cycle === 'annual' ? 365 : 30;
      payload.subscription_status = 'active';
      payload.subscription_start_date = now.toISOString();
      payload.subscription_end_date = new Date(now.getTime() + days * 86400000).toISOString();
      payload.trial_end_date = null;
    } else if (legacyMatch) {
      if (newPlan === 'trial') {
        payload.subscription_status = 'trial';
        payload.trial_end_date = new Date(now.getTime() + 30 * 86400000).toISOString();
      } else if (newPlan === 'lifetime') {
        payload.subscription_status = 'lifetime';
        payload.subscription_start_date = now.toISOString();
        payload.subscription_end_date = null;
      } else {
        const days = legacyMatch.days ?? 30;
        payload.subscription_status = 'active';
        payload.subscription_start_date = now.toISOString();
        payload.subscription_end_date = new Date(now.getTime() + days * 86400000).toISOString();
      }
    }

    const { error } = await supabase.from('profiles').update(payload).eq('id', planChange.id);

    if (!error) {
      // Best-effort audit entry — never blocks the change.
      const amount = tierMatch ? priceFor(newPlan, cycle) : (legacyMatch?.price ?? 0);
      await supabase.from('audit_log').insert({
        user_id: planChange.id,
        action: 'super_admin_change_plan',
        details: `Plan set to ${newPlan}${tierMatch ? ` (${cycle}, GH₵${amount})` : ''}`,
      } as any).then(() => undefined, () => undefined);
    }

    setBusy(false);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Plan updated', description: `${planChange.name} → ${newPlan}${tierMatch ? ` (${cycle})` : ''}` });
    setPlanChange(null);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">Every active and past subscription on the platform.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Renews</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const renew = r.trial_end_date ?? r.subscription_end_date;
                  const priceLabel = priceFor(r.subscription_plan, 'monthly');
                  return (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.business_name ?? '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{r.email}</div>
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{r.subscription_plan}</Badge></td>
                      <td className="px-3 py-2"><Badge className="text-[10px]" variant={r.subscription_status === 'active' ? 'default' : r.subscription_status === 'trial' ? 'secondary' : 'destructive'}>{r.subscription_status}</Badge></td>
                      <td className="px-3 py-2">GH₵{priceLabel.toLocaleString()}</td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">{renew ? new Date(renew).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => {
                          setPlanChange({ id: r.id, name: r.business_name ?? r.email ?? '' });
                          setNewPlan(r.subscription_plan);
                          setCycle('monthly');
                        }}>
                          Change Plan
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!planChange} onOpenChange={(o) => !o && setPlanChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan — {planChange?.name}</DialogTitle>
            <DialogDescription className="text-xs">
              Plans and prices load live from Pricing Management. Existing payment history is preserved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Plan</Label>
              <Select value={newPlan} onValueChange={setNewPlan}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pricing.map((p) => (
                    <SelectItem key={p.tier} value={p.tier}>
                      {p.name} — GH₵{p.price_monthly}/mo · GH₵{p.price_annual}/yr
                    </SelectItem>
                  ))}
                  <div className="my-1 border-t" />
                  {LEGACY_PLANS.map((l) => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isTiered && (
              <div>
                <Label className="text-xs">Billing cycle</Label>
                <Select value={cycle} onValueChange={(v) => setCycle(v as 'monthly' | 'annual')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly (30 days) — GH₵{priceFor(newPlan, 'monthly')}</SelectItem>
                    <SelectItem value="annual">Annual (365 days) — GH₵{priceFor(newPlan, 'annual')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanChange(null)}>Cancel</Button>
            <Button onClick={setPlan} disabled={busy}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
