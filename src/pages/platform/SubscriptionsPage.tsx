import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Row = {
  id: string;
  business_name: string | null;
  email: string | null;
  subscription_plan: string;
  subscription_status: string;
  subscription_end_date: string | null;
  trial_end_date: string | null;
};

const PLAN_PRICE: Record<string, number> = { monthly: 50, annual: 500, lifetime: 0, trial: 0, free_trial: 0 };

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [planChange, setPlanChange] = useState<{ id: string; name: string } | null>(null);
  const [newPlan, setNewPlan] = useState<'trial' | 'monthly' | 'annual' | 'lifetime'>('monthly');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id,business_name,email,subscription_plan,subscription_status,subscription_end_date,trial_end_date')
      .order('updated_at', { ascending: false });
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase.channel('platform-subs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const setPlan = async () => {
    if (!planChange) return;
    setBusy(true);
    const now = new Date();
    const payload: any = { subscription_plan: newPlan };
    if (newPlan === 'trial') {
      payload.subscription_status = 'trial';
      payload.trial_end_date = new Date(now.getTime() + 30 * 86400000).toISOString();
    } else if (newPlan === 'lifetime') {
      payload.subscription_status = 'lifetime' as any;
      payload.subscription_start_date = now.toISOString();
      payload.subscription_end_date = null;
    } else {
      const days = newPlan === 'annual' ? 365 : 30;
      payload.subscription_status = 'active';
      payload.subscription_start_date = now.toISOString();
      payload.subscription_end_date = new Date(now.getTime() + days * 86400000).toISOString();
    }
    const { error } = await supabase.from('profiles').update(payload).eq('id', planChange.id);
    setBusy(false);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Plan updated' });
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
                  return (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.business_name ?? '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{r.email}</div>
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{r.subscription_plan}</Badge></td>
                      <td className="px-3 py-2"><Badge className="text-[10px]" variant={r.subscription_status === 'active' ? 'default' : r.subscription_status === 'trial' ? 'secondary' : 'destructive'}>{r.subscription_status}</Badge></td>
                      <td className="px-3 py-2">GH₵{(PLAN_PRICE[r.subscription_plan] ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">{renew ? new Date(renew).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => { setPlanChange({ id: r.id, name: r.business_name ?? r.email ?? '' }); setNewPlan(r.subscription_plan as any); }}>
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
          </DialogHeader>
          <Select value={newPlan} onValueChange={(v) => setNewPlan(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="trial">Free Trial (30 days)</SelectItem>
              <SelectItem value="monthly">Monthly — GH₵50</SelectItem>
              <SelectItem value="annual">Annual — GH₵500</SelectItem>
              <SelectItem value="lifetime">Lifetime</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanChange(null)}>Cancel</Button>
            <Button onClick={setPlan} disabled={busy}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
