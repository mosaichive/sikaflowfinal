import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { downloadCsv, SmsContactInput } from '@/lib/bulk-sms';
import { getFunctionErrorMessage } from '@/lib/function-errors';
import { supabase } from '@/integrations/supabase/client';
import { Ban, Copy, Download, Eye, History, Loader2, RefreshCw, RotateCcw } from 'lucide-react';

type Campaign = {
  id: string;
  name: string;
  message: string;
  status: string;
  total_recipients: number;
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  total_pending: number;
  total_invalid: number;
  total_duplicates: number;
  total_excluded: number;
  provider: string;
  sender_id: string | null;
  segments_per_recipient: number;
  estimated_total_segments: number;
  created_by_email: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type Recipient = {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  phone_number: string;
  normalized_phone_number: string | null;
  status: string;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
};

const statusTone: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  partially_completed: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  failed: 'bg-destructive/15 text-destructive',
  sending: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  queued: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  cancelled: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
};

export default function BulkSmsHistoryPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientPage, setRecipientPage] = useState(0);
  const [recipientCount, setRecipientCount] = useState(0);
  const [retrying, setRetrying] = useState<Campaign | null>(null);
  const [cancelling, setCancelling] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const { data, error } = await supabase.from('bulk_sms_campaigns').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) toast({ title: 'Could not load campaign history', description: error.message, variant: 'destructive' });
    else setCampaigns((data ?? []) as Campaign[]);
    if (!quiet) setLoading(false);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const active = useMemo(() => campaigns.some((campaign) => ['queued', 'sending'].includes(campaign.status)), [campaigns]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(true), 5000);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const loadRecipients = useCallback(async (campaignId: string, page: number) => {
    const { data, error, count } = await supabase.from('bulk_sms_recipients').select('*', { count: 'exact' }).eq('campaign_id', campaignId).order('created_at').range(page * 100, page * 100 + 99);
    if (error) toast({ title: 'Could not load recipients', description: error.message, variant: 'destructive' });
    else { setRecipients((data ?? []) as Recipient[]); setRecipientCount(count ?? 0); }
  }, [toast]);
  useEffect(() => { if (selected) void loadRecipients(selected.id, recipientPage); }, [loadRecipients, recipientPage, selected]);

  async function invoke(action: 'retry_failed' | 'cancel' | 'resume', campaign: Campaign) {
    setBusy(`${action}:${campaign.id}`);
    try {
      const { error } = await supabase.functions.invoke('admin-bulk-sms', { body: { action, campaign_id: campaign.id } });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Campaign action failed'));
      toast({ title: action === 'retry_failed' ? 'Failed recipients queued' : action === 'resume' ? 'Campaign worker resumed' : 'Campaign cancelled' });
      setRetrying(null); setCancelling(null);
      await load();
    } catch (error) {
      toast({ title: 'Campaign action failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally { setBusy(null); }
  }

  async function duplicateCampaign(campaign: Campaign) {
    setBusy(`duplicate:${campaign.id}`);
    try {
      const contacts: SmsContactInput[] = [];
      for (let from = 0; from < 5000; from += 1000) {
        const { data, error } = await supabase.from('bulk_sms_recipients')
          .select('phone_number, contact_name, business_name')
          .eq('campaign_id', campaign.id)
          .not('normalized_phone_number', 'is', null)
          .not('status', 'in', '(invalid,duplicate,suppressed,cancelled)')
          .range(from, from + 999);
        if (error) throw error;
        for (const row of data ?? []) contacts.push({ phone: row.phone_number, contactName: row.contact_name ?? undefined, businessName: row.business_name ?? undefined });
        if ((data?.length ?? 0) < 1000) break;
      }
      navigate('/super-admin/bulk-sms', { state: { duplicate: { campaignName: `${campaign.name} copy`, message: campaign.message, recipients: contacts } } });
    } catch (error) {
      toast({ title: 'Could not duplicate campaign', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally { setBusy(null); }
  }

  async function exportCampaign(campaign: Campaign) {
    setBusy(`export:${campaign.id}`);
    try {
      const rows: Recipient[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('bulk_sms_recipients').select('*').eq('campaign_id', campaign.id).order('created_at').range(from, from + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as Recipient[]));
        if ((data?.length ?? 0) < 1000) break;
      }
      downloadCsv(`${campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-results.csv`, rows.map((row) => ({
        'Business name': row.business_name ?? '', 'Contact name': row.contact_name ?? '', Phone: row.normalized_phone_number ?? row.phone_number,
        Status: row.status, 'Provider message ID': row.provider_message_id ?? '', Error: row.error_message ?? '',
        'Sent time': row.sent_at ?? '', 'Delivered time': row.delivered_at ?? '',
      })));
    } catch (error) {
      toast({ title: 'Could not export campaign', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally { setBusy(null); }
  }

  return <div className="space-y-6 max-w-7xl">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><History className="h-6 w-6" /> Bulk SMS History</h1><p className="text-sm text-muted-foreground">Provider acceptance and handset delivery are tracked separately.</p></div><Button variant="outline" onClick={() => load()} disabled={loading}><RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button></div>
    <div className="overflow-hidden rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Campaign</TableHead><TableHead>Date</TableHead><TableHead>Recipients</TableHead><TableHead>Sent</TableHead><TableHead>Delivered</TableHead><TableHead>Failed</TableHead><TableHead>Status</TableHead><TableHead>Created By</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
      {loading ? <TableRow><TableCell colSpan={9} className="h-28 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow> : campaigns.length === 0 ? <TableRow><TableCell colSpan={9} className="h-28 text-center text-muted-foreground">No external-contact campaigns yet.</TableCell></TableRow> : campaigns.map((campaign) => <TableRow key={campaign.id}><TableCell className="font-medium">{campaign.name}</TableCell><TableCell>{new Date(campaign.created_at).toLocaleString()}</TableCell><TableCell>{campaign.total_recipients.toLocaleString()}</TableCell><TableCell>{campaign.total_sent.toLocaleString()}</TableCell><TableCell>{campaign.total_delivered.toLocaleString()}</TableCell><TableCell>{campaign.total_failed.toLocaleString()}</TableCell><TableCell><Badge className={statusTone[campaign.status] ?? statusTone.draft} variant="secondary">{campaign.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell className="max-w-44 truncate">{campaign.created_by_email || 'Super Admin'}</TableCell><TableCell className="text-right whitespace-nowrap">
        <Button size="icon" variant="ghost" title="View details" onClick={() => { setRecipientPage(0); setSelected(campaign); }}><Eye className="h-4 w-4" /></Button>
        {campaign.total_failed > 0 && <Button size="icon" variant="ghost" title="Retry failed recipients" onClick={() => setRetrying(campaign)}><RotateCcw className="h-4 w-4" /></Button>}
        {['queued', 'sending'].includes(campaign.status) && campaign.total_pending > 0 && <Button size="icon" variant="ghost" title="Resume server processing" onClick={() => void invoke('resume', campaign)}><RefreshCw className="h-4 w-4" /></Button>}
        <Button size="icon" variant="ghost" title="Duplicate campaign" disabled={busy === `duplicate:${campaign.id}`} onClick={() => void duplicateCampaign(campaign)}><Copy className="h-4 w-4" /></Button>
        {['draft', 'queued', 'sending'].includes(campaign.status) && <Button size="icon" variant="ghost" className="text-destructive" title="Cancel campaign" onClick={() => setCancelling(campaign)}><Ban className="h-4 w-4" /></Button>}
      </TableCell></TableRow>)}
    </TableBody></Table></div>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>{selected && <div className="space-y-5">
      <div className="rounded-md border border-border bg-muted/30 p-4 whitespace-pre-wrap text-sm">{selected.message}</div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metric label="Recipients" value={selected.total_recipients} /><Metric label="Sent" value={selected.total_sent} /><Metric label="Delivered" value={selected.total_delivered} /><Metric label="Failed" value={selected.total_failed} /><Metric label="Pending" value={selected.total_pending} /><Metric label="Segments" value={selected.estimated_total_segments} /></div>
      <div className="overflow-hidden rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Business</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead>Provider ID</TableHead><TableHead>Error</TableHead><TableHead>Sent</TableHead><TableHead>Delivered</TableHead></TableRow></TableHeader><TableBody>{recipients.map((row) => <TableRow key={row.id}><TableCell>{row.contact_name || '—'}</TableCell><TableCell>{row.business_name || '—'}</TableCell><TableCell className="font-mono text-xs">{row.normalized_phone_number || row.phone_number}</TableCell><TableCell><Badge variant="outline">{row.status}</Badge></TableCell><TableCell className="max-w-36 truncate font-mono text-xs">{row.provider_message_id || '—'}</TableCell><TableCell className="max-w-48 truncate text-xs text-destructive">{row.error_message || '—'}</TableCell><TableCell>{row.sent_at ? new Date(row.sent_at).toLocaleString() : '—'}</TableCell><TableCell>{row.delivered_at ? new Date(row.delivered_at).toLocaleString() : '—'}</TableCell></TableRow>)}</TableBody></Table></div>
      <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{recipientCount === 0 ? 'No recipient rows' : `Showing ${recipientPage * 100 + 1}-${Math.min((recipientPage + 1) * 100, recipientCount)} of ${recipientCount.toLocaleString()}`}</span><div className="flex gap-2"><Button variant="outline" disabled={recipientPage === 0} onClick={() => setRecipientPage((value) => value - 1)}>Previous</Button><Button variant="outline" disabled={(recipientPage + 1) * 100 >= recipientCount} onClick={() => setRecipientPage((value) => value + 1)}>Next</Button></div></div>
    </div>}<DialogFooter>{selected && <Button variant="outline" onClick={() => void exportCampaign(selected)} disabled={busy === `export:${selected.id}`}><Download className="mr-2 h-4 w-4" /> Export results</Button>}<Button onClick={() => setSelected(null)}>Close</Button></DialogFooter></DialogContent></Dialog>

    <AlertDialog open={Boolean(retrying)} onOpenChange={(open) => { if (!open) setRetrying(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Retry failed recipients?</AlertDialogTitle><AlertDialogDescription>Only {retrying?.total_failed.toLocaleString()} failed recipients will be queued. Sent and delivered recipients will not receive another message.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => retrying && void invoke('retry_failed', retrying)}>Retry failed only</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={Boolean(cancelling)} onOpenChange={(open) => { if (!open) setCancelling(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancel campaign?</AlertDialogTitle><AlertDialogDescription>Recipients already accepted by the provider cannot be recalled. Pending recipients will not be sent.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep campaign</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => cancelling && void invoke('cancel', cancelling)}>Cancel campaign</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold">{value.toLocaleString()}</p></div>; }
