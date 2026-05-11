import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle2, Clock3, Search } from 'lucide-react';

type Row = {
  id: string;
  user_id: string;
  plan: string;
  amount: number;
  payment_method: string;
  status: string;
  reference: string | null;
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const STATUS_FILTERS = ['all', 'pending', 'review', 'confirmed', 'approved', 'rejected', 'failed'] as const;

export default function PaymentsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [businessNames, setBusinessNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('subscription_payments')
      .select('*')
      .order('created_at', { ascending: false });
    const list = (data as Row[]) ?? [];
    setRows(list);
    const userIds = Array.from(new Set(list.map((r) => r.user_id)));
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id,business_name,email').in('id', userIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.business_name || p.email || '—'; });
      setBusinessNames(map);
    }
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase.channel('platform-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_payments' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const act = async (row: Row, status: 'confirmed' | 'rejected') => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('subscription_payments').update({
      status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id,
    }).eq('id', row.id);

    if (status === 'confirmed' && !error) {
      const now = new Date();
      const days = row.plan === 'annual' ? 365 : 30;
      const planUpdate: any = {
        subscription_plan: row.plan,
        subscription_status: row.plan === 'lifetime' ? 'lifetime' : 'active',
        subscription_start_date: now.toISOString(),
        subscription_end_date: row.plan === 'lifetime' ? null : new Date(now.getTime() + days * 86400000).toISOString(),
      };
      await supabase.from('profiles').update(planUpdate).eq('id', row.user_id);
    }

    setBusy(false);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: status === 'confirmed' ? 'Payment confirmed' : 'Payment rejected' });
    await load();
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const haystack = [businessNames[row.user_id], row.reference, row.plan, row.note].join(' ').toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    });
  }, [rows, search, statusFilter, businessNames]);

  const summary = useMemo(() => {
    const confirmed = rows.filter((row) => row.status === 'confirmed' || row.status === 'approved');
    return {
      pending: rows.filter((r) => r.status === 'pending').length,
      review: rows.filter((r) => r.status === 'review').length,
      confirmed: confirmed.length,
      revenue: confirmed.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">Subscription payment submissions across the platform.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Pending" value={summary.pending} tone="text-amber-500" icon={<Clock3 className="h-4 w-4" />} />
        <SummaryCard label="Review" value={summary.review} tone="text-orange-500" icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryCard label="Confirmed" value={summary.confirmed} tone="text-emerald-500" icon={<CheckCircle2 className="h-4 w-4" />} />
        <SummaryCard label="Revenue" value={`GH₵${summary.revenue.toLocaleString()}`} tone="text-primary" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Subscription Payments</CardTitle>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search business, ref..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((s) => <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 align-top">
                    <td className="px-3 py-3 text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-3 py-3 font-medium">{businessNames[row.user_id] ?? '—'}</td>
                    <td className="px-3 py-3"><Badge variant="outline" className="text-[10px]">{row.plan}</Badge></td>
                    <td className="px-3 py-3 font-semibold">GH₵{Number(row.amount).toLocaleString()}</td>
                    <td className="px-3 py-3 text-[11px]">{row.payment_method}</td>
                    <td className="px-3 py-3"><Badge variant={row.status === 'confirmed' || row.status === 'approved' ? 'default' : row.status === 'pending' ? 'secondary' : 'destructive'}>{row.status}</Badge></td>
                    <td className="px-3 py-3 text-[11px] font-mono">{row.reference || '—'}</td>
                    <td className="px-3 py-3 text-right">
                      {row.status === 'pending' || row.status === 'review' ? (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" disabled={busy} onClick={() => act(row, 'confirmed')}>Confirm</Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(row, 'rejected')}>Reject</Button>
                        </div>
                      ) : <span className="text-[10px] text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No payments match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, tone, icon }: { label: string; value: number | string; tone: string; icon: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground ${tone}`}>
          {icon}<span>{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
