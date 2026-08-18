import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Download, FileText, Loader2, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFunctionErrorMessage } from '@/lib/function-errors';

interface Delivery {
  id: string;
  period: string;
  status: string;
  sent_at: string | null;
  generated_at: string | null;
  error_message: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function periodLabel(period: string) {
  const [y, m] = period.split('-');
  const idx = Number(m) - 1;
  return `${MONTHS[idx] ?? m} ${y}`;
}

/** The last 6 completed calendar months, most recent first. */
function recentPeriods(count = 6) {
  const out: string[] = [];
  const now = new Date();
  for (let i = 1; i <= count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const statusVariant = (status: string) =>
  status === 'sent' ? 'default' : status === 'failed' ? 'destructive' : 'secondary';

export function MonthlyStatementCard() {
  const { user, emailVerified } = useAuth();
  const { businessId } = useBusiness();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const isOwner = !!user && !!businessId && user.id === businessId;

  const loadDeliveries = useCallback(async () => {
    if (!businessId) return;
    const { data } = await supabase
      .from('statement_deliveries')
      .select('id, period, status, sent_at, generated_at, error_message')
      .eq('business_id', businessId)
      .order('period', { ascending: false })
      .limit(12);
    setDeliveries((data || []) as Delivery[]);
  }, [businessId]);

  useEffect(() => {
    if (!businessId) return;
    void (async () => {
      const { data } = await supabase
        .from('profiles').select('monthly_statement_enabled').eq('id', businessId).maybeSingle();
      if (data) setEnabled((data as any).monthly_statement_enabled !== false);
    })();
    void loadDeliveries();
  }, [businessId, loadDeliveries]);

  const toggle = async (value: boolean) => {
    if (!businessId) return;
    setEnabled(value);
    setSaving(true);
    const { error } = await supabase
      .from('profiles').update({ monthly_statement_enabled: value } as any).eq('id', businessId);
    if (error) {
      setEnabled(!value);
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: value ? 'Monthly financial statement on' : 'Monthly financial statement off' });
    }
    setSaving(false);
  };

  const invoke = async (action: 'my_download' | 'my_resend', period: string) => {
    setBusy(`${action}:${period}`);
    try {
      const { data, error } = await supabase.functions.invoke('admin-monthly-statements', {
        body: { action, period },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (action === 'my_download') {
        const bytes = Uint8Array.from(atob(data.pdf), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename || `KudiTrack_Financial_Statement_${period}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        if (data?.skipped) throw new Error(data.reason === 'email_unverified'
          ? 'Please verify your email address to receive your monthly financial statement.'
          : 'No verified email address on file.');
        toast({ title: 'Statement emailed', description: `Sent to ${user?.email}.` });
        await loadDeliveries();
      }
    } catch (err) {
      toast({
        title: action === 'my_download' ? 'Could not generate statement' : 'Could not send statement',
        description: await getFunctionErrorMessage(err, 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!isOwner) return null;

  const byPeriod = new Map(deliveries.map((d) => [d.period, d]));
  const periods = Array.from(new Set([...deliveries.map((d) => d.period), ...recentPeriods()]))
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Monthly Financial Statement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-sm">Receive your KudiTrack financial statement automatically every month.</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Statement Email: <span className="font-medium text-foreground">{user?.email}</span>
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
        </div>

        {!emailVerified && (
          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Please verify your email address to receive your monthly financial statement.</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          On the 1st of each month we generate the financial statement for the previous completed month and email it to you as a PDF.
        </p>

        <div className="space-y-2">
          <p className="text-sm font-medium">Financial Statements</p>
          {periods.map((period) => {
            const delivery = byPeriod.get(period);
            return (
              <div key={period} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{periodLabel(period)}</span>
                  <Badge variant={statusVariant(delivery?.status || 'pending')} className="capitalize">
                    {delivery?.status || 'Not sent'}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => invoke('my_download', period)}>
                    {busy === `my_download:${period}`
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Download className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">PDF</span>
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null || !emailVerified} onClick={() => invoke('my_resend', period)}>
                    {busy === `my_resend:${period}`
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">Email</span>
                  </Button>
                </div>
              </div>
            );
          })}
          {deliveries.some((d) => d.status === 'failed') && (
            <p className="text-xs text-destructive">
              A delivery failed — use Email to retry safely. Statements are never sent twice for the same month automatically.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
