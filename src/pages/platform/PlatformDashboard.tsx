import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Sparkles, CheckCircle2, AlertCircle, XCircle, Banknote, Calendar, Clock, AlertTriangle } from 'lucide-react';

interface Stat { label: string; value: number | string; icon: any; tone: string; }

export default function PlatformDashboard() {
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [profilesRes, paymentsRes] = await Promise.all([
      supabase.from('profiles').select('id,subscription_plan,subscription_status,suspended,created_at'),
      supabase.from('subscription_payments').select('amount,status,plan'),
    ]);
    const profiles = profilesRes.data ?? [];
    const payments = paymentsRes.data ?? [];

    const totalRevenue = payments
      .filter((p: any) => p.status === 'confirmed' || p.status === 'approved')
      .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);

    const activeMonthly = profiles.filter((p: any) => p.subscription_status === 'active' && p.subscription_plan === 'monthly').length;
    const activeAnnual = profiles.filter((p: any) => p.subscription_status === 'active' && p.subscription_plan === 'annual').length;

    setStats([
      { label: 'Total Businesses', value: profiles.length, icon: Building2, tone: 'text-blue-500' },
      { label: 'Active Trials', value: profiles.filter((p: any) => p.subscription_status === 'trial').length, icon: Sparkles, tone: 'text-amber-500' },
      { label: 'Active Monthly', value: activeMonthly, icon: CheckCircle2, tone: 'text-emerald-500' },
      { label: 'Active Annual', value: activeAnnual, icon: CheckCircle2, tone: 'text-emerald-600' },
      { label: 'Lifetime', value: profiles.filter((p: any) => p.subscription_plan === 'lifetime').length, icon: CheckCircle2, tone: 'text-purple-500' },
      { label: 'Expired', value: profiles.filter((p: any) => p.subscription_status === 'expired').length, icon: AlertCircle, tone: 'text-orange-500' },
      { label: 'Suspended', value: profiles.filter((p: any) => p.suspended).length, icon: XCircle, tone: 'text-red-500' },
      { label: 'Signups (30d)', value: profiles.filter((p: any) => new Date(p.created_at) > new Date(Date.now() - 30 * 86400000)).length, icon: Clock, tone: 'text-yellow-500' },
      { label: 'Payments Pending', value: payments.filter((p: any) => p.status === 'pending').length, icon: Clock, tone: 'text-amber-500' },
      { label: 'Payments Review', value: payments.filter((p: any) => p.status === 'review').length, icon: AlertTriangle, tone: 'text-orange-500' },
      { label: 'Total Revenue', value: `GH₵${totalRevenue.toLocaleString()}`, icon: Banknote, tone: 'text-emerald-600' },
      { label: 'Expected Monthly', value: `GH₵${(activeMonthly * 50 + activeAnnual * 42).toLocaleString()}`, icon: Calendar, tone: 'text-blue-600' },
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel('platform-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_payments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">High-level health of every business on SikaFlow.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading metrics...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <s.icon className={`h-3.5 w-3.5 ${s.tone}`} /> {s.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
