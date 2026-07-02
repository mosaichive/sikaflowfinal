import { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { RefreshCw, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type SmsLog = {
  id: string;
  recipient_phone: string | null;
  notification_type: string | null;
  message_preview: string | null;
  status: string | null;
  error_message: string | null;
  provider_response: any;
  reference_id: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  sent: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  failed: 'bg-destructive/15 text-destructive border-destructive/30',
  queued: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
};

export function SmsLogsCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SmsLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('sms_logs')
      .select('id, recipient_phone, notification_type, message_preview, status, error_message, provider_response, reference_id, created_at')
      .eq('business_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) setRows(data as SmsLog[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && (r.status || '').toLowerCase() !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.recipient_phone || '').toLowerCase().includes(q) ||
        (r.notification_type || '').toLowerCase().includes(q) ||
        (r.message_preview || '').toLowerCase().includes(q) ||
        (r.error_message || '').toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, query]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> SMS Delivery Status
          </CardTitle>
          <CardDescription>
            Last 100 SMS attempts sent from your business. Use this to debug delivery issues.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Search phone, type, message or error…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">
            {loading ? 'Loading…' : 'No SMS logs yet.'}
          </div>
        ) : (
          <div className="divide-y border rounded-md">
            {filtered.map((r) => {
              const badge = STATUS_STYLES[(r.status || '').toLowerCase()] || 'bg-muted text-muted-foreground';
              const provider = r.provider_response as any;
              const providerStatus =
                provider?.SMSMessageData?.Recipients?.[0]?.status ||
                provider?.status || null;
              const providerCost =
                provider?.SMSMessageData?.Recipients?.[0]?.cost || null;
              return (
                <div key={r.id} className="p-3 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={badge}>{r.status || 'unknown'}</Badge>
                    <span className="text-sm font-medium">{r.recipient_phone || '—'}</span>
                    <span className="text-xs text-muted-foreground">{r.notification_type || 'sms'}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {r.message_preview && (
                    <p className="text-xs text-muted-foreground break-words">{r.message_preview}</p>
                  )}
                  {(providerStatus || providerCost) && (
                    <p className="text-[11px] text-muted-foreground">
                      Provider: {providerStatus || '—'}{providerCost ? ` • ${providerCost}` : ''}
                    </p>
                  )}
                  {r.error_message && (
                    <p className="text-xs text-destructive break-words">Error: {r.error_message}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
