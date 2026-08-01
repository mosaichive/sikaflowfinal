import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getFunctionErrorMessage } from '@/lib/function-errors';
import { FileDown, Play, RefreshCw, Search, Send } from 'lucide-react';

type Settings = {
  automation_enabled: boolean;
  from_name: string;
  from_email: string;
  last_run_at: string | null;
  last_run_period: string | null;
};

type Delivery = {
  id: string;
  business_id: string;
  business_name: string | null;
  email: string;
  period: string;
  status: string;
  generated_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  retry_count: number;
  totals: Record<string, number> | null;
};

type BusinessRow = { id: string; business_name: string | null; email: string | null };

function defaultPeriod() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

function statusTone(status: string) {
  if (status === 'sent') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
  if (status === 'failed') return 'bg-destructive/10 text-destructive';
  if (status === 'skipped') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  return 'bg-muted text-muted-foreground';
}

export default function MonthlyStatementsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [period, setPeriod] = useState(defaultPeriod());
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<BusinessRow | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, d, b] = await Promise.all([
      supabase.from('statement_settings').select('*').eq('singleton_key', 'default').maybeSingle(),
      supabase.from('statement_deliveries').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('profiles').select('id, business_name, email').not('email', 'is', null).order('business_name').limit(500),
    ]);
    setSettings((s.data as any) ?? null);
    setDeliveries((d.data as any) ?? []);
    setBusinesses((b.data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const periodDeliveries = useMemo(
    () => deliveries.filter((d) => d.period === period),
    [deliveries, period],
  );

  const stats = useMemo(() => ({
    sent: periodDeliveries.filter((d) => d.status === 'sent').length,
    failed: periodDeliveries.filter((d) => d.status === 'failed').length,
    skipped: periodDeliveries.filter((d) => d.status === 'skipped').length,
  }), [periodDeliveries]);

  const filteredBusinesses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return businesses.slice(0, 8);
    return businesses
      .filter((b) => `${b.business_name ?? ''} ${b.email ?? ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [businesses, search]);

  const call = async (body: Record<string, unknown>, label: string) => {
    const { data, error } = await supabase.functions.invoke('admin-monthly-statements', { body });
    if (error) throw error;
    if ((data as any)?.error) throw new Error(String((data as any).error));
    if ((data as any)?.ok === false) {
      throw new Error(String((data as any)?.error ?? (data as any)?.reason ?? `${label} failed`));
    }
    return data as any;
  };

  const updateSettings = async (patch: Partial<Settings>) => {
    const { error } = await supabase
      .from('statement_settings')
      .update(patch as any)
      .eq('singleton_key', 'default');
    if (error) { toast.error(error.message); return; }
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    toast.success('Settings updated');
  };

  const runNow = async (businessIds?: string[]) => {
    const scope = businessIds?.length ? 'this business' : 'ALL eligible businesses';
    if (!confirm(`Generate and email ${period} statements to ${scope}?`)) return;
    setBusy('run');
    try {
      const res = await call(
        { action: 'run', period, force: true, ...(businessIds?.length ? { business_ids: businessIds } : {}) },
        'Run',
      );
      toast.success(`Sent ${res.sent}, failed ${res.failed}, skipped ${res.skipped}`);
      void refresh();
    } catch (e) {
      toast.error(await getFunctionErrorMessage(e, 'Could not run statements'));
    } finally { setBusy(null); }
  };

  const previewPdf = async (businessId: string) => {
    setBusy('preview');
    try {
      const res = await call({ action: 'preview', business_id: businessId, period }, 'Preview');
      const bytes = Uint8Array.from(atob(res.pdf), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(await getFunctionErrorMessage(e, 'Could not generate preview'));
    } finally { setBusy(null); }
  };

  const sendTest = async () => {
    if (!selected) { toast.error('Pick a business first.'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail.trim())) { toast.error('Enter a valid test email.'); return; }
    setBusy('test');
    try {
      await call({ action: 'test', business_id: selected.id, to: testEmail.trim(), period }, 'Test send');
      toast.success(`Test statement sent to ${testEmail}`);
    } catch (e) {
      toast.error(await getFunctionErrorMessage(e, 'Could not send test statement'));
    } finally { setBusy(null); }
  };

  const resend = async (id: string) => {
    setBusy(id);
    try {
      await call({ action: 'resend', delivery_id: id }, 'Resend');
      toast.success('Statement resent');
      void refresh();
    } catch (e) {
      toast.error(await getFunctionErrorMessage(e, 'Could not resend statement'));
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Automated monthly statements</h3>
            <p className="text-sm text-muted-foreground">
              A PDF business statement is emailed to every business at the start of each month.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto" className="text-sm">Automation</Label>
            <Switch
              id="auto"
              checked={settings?.automation_enabled ?? false}
              onCheckedChange={(v) => updateSettings({ automation_enabled: v })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="from-name">Sender name</Label>
            <Input
              id="from-name"
              value={settings?.from_name ?? ''}
              onChange={(e) => setSettings((p) => (p ? { ...p, from_name: e.target.value } : p))}
              onBlur={(e) => updateSettings({ from_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="from-email">Sender email</Label>
            <Input
              id="from-email"
              value={settings?.from_email ?? ''}
              onChange={(e) => setSettings((p) => (p ? { ...p, from_email: e.target.value } : p))}
              onBlur={(e) => updateSettings({ from_email: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="period">Statement month</Label>
            <Input id="period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Last run: {settings?.last_run_at ? new Date(settings.last_run_at).toLocaleString() : 'never'}</span>
          {settings?.last_run_period && <span>({settings.last_run_period})</span>}
          <Button size="sm" onClick={() => runNow()} disabled={busy === 'run'}>
            <Play className="h-4 w-4 mr-1" /> {busy === 'run' ? 'Running…' : 'Run for this month'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Preview, test or send one business</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search business name or email"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
          />
        </div>
        {!selected && search.trim() && (
          <div className="divide-y rounded-md border">
            {filteredBusinesses.map((b) => (
              <button
                key={b.id}
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => { setSelected(b); setSearch(b.business_name ?? b.email ?? ''); }}
              >
                <span className="font-medium">{b.business_name ?? 'Unnamed business'}</span>
                <span className="text-muted-foreground">{b.email}</span>
              </button>
            ))}
            {filteredBusinesses.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted-foreground">No match.</p>
            )}
          </div>
        )}
        {selected && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm">
              <span className="font-medium">{selected.business_name ?? 'Unnamed business'}</span>{' '}
              <span className="text-muted-foreground">{selected.email}</span>
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Button size="sm" variant="outline" onClick={() => previewPdf(selected.id)} disabled={busy === 'preview'}>
                <FileDown className="h-4 w-4 mr-1" /> {busy === 'preview' ? 'Building…' : 'Preview PDF'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => runNow([selected.id])} disabled={busy === 'run'}>
                <Send className="h-4 w-4 mr-1" /> Send to this business
              </Button>
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="test-email" className="text-xs">Test address</Label>
                  <Input
                    id="test-email"
                    className="h-9 w-56"
                    placeholder="you@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={sendTest} disabled={busy === 'test'}>
                  {busy === 'test' ? 'Sending…' : 'Send test'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">Delivery log — {period}</h3>
          <Badge variant="secondary">{stats.sent} sent</Badge>
          <Badge variant="secondary">{stats.failed} failed</Badge>
          <Badge variant="secondary">{stats.skipped} skipped</Badge>
        </div>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && periodDeliveries.length === 0 && (
          <p className="text-sm text-muted-foreground">No statements generated for this month yet.</p>
        )}
        <div className="divide-y">
          {periodDeliveries.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.business_name ?? d.business_id}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.email || 'no email'}
                  {d.sent_at ? ` · sent ${new Date(d.sent_at).toLocaleString()}` : ''}
                  {d.retry_count ? ` · retries ${d.retry_count}` : ''}
                </p>
                {d.error_message && <p className="text-xs text-destructive">{d.error_message}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone(d.status)}`}>{d.status}</span>
                <Button size="sm" variant="ghost" onClick={() => resend(d.id)} disabled={busy === d.id}>
                  {busy === d.id ? 'Sending…' : 'Resend'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
