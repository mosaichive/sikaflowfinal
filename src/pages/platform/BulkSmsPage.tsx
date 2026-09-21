import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getFunctionErrorMessage } from '@/lib/function-errors';
import {
  SmsContactInput, analyzeRecipients, getSmsMetrics, parseContactFile, splitManualRecipients,
} from '@/lib/bulk-sms';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, CalendarClock, CheckCircle2, FileSpreadsheet, Loader2, MessageSquareText, Send, Upload, Users } from 'lucide-react';

type ContactList = { id: string; name: string; contact_count?: number };
type SmsTemplate = { id: string; name: string; message: string };
type Preview = {
  campaign_id: string;
  provider: string;
  sender_id: string;
  total_rows: number;
  valid_numbers: number;
  invalid_numbers: number;
  duplicate_numbers: number;
  excluded_numbers: number;
  recipient_count: number;
  characters: number;
  encoding: 'gsm7' | 'ucs2';
  segments_per_recipient: number;
  estimated_total_segments: number;
  estimated_cost: number | null;
};

type DuplicateState = {
  duplicate?: { campaignName: string; message: string; recipients: SmsContactInput[] };
  prefillMessage?: string;
};

const MAX_RECIPIENTS = 5000;
const MAX_SEGMENTS = 6;

export default function BulkSmsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as DuplicateState | null;
  const duplicate = routeState?.duplicate;
  const [campaignName, setCampaignName] = useState(duplicate?.campaignName ?? '');
  const [message, setMessage] = useState(duplicate?.message ?? routeState?.prefillMessage ?? '');
  const [source, setSource] = useState<'manual' | 'upload' | 'contact_list'>(duplicate ? 'upload' : 'manual');
  const [manualText, setManualText] = useState('');
  const [uploadedRows, setUploadedRows] = useState<SmsContactInput[]>(duplicate?.recipients ?? []);
  const [uploadedFileName, setUploadedFileName] = useState(duplicate ? 'Duplicated campaign recipients' : '');
  const [lists, setLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [busy, setBusy] = useState<'file' | 'preview' | 'send' | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    void (async () => {
      const [listResult, templateResult] = await Promise.all([
        supabase.from('external_contact_lists').select('id, name').order('name'),
        supabase.from('sms_templates').select('id, name, message').order('name'),
      ]);
      if (listResult.error) toast({ title: 'Could not load contact lists', description: listResult.error.message, variant: 'destructive' });
      else {
        const counts = await Promise.all((listResult.data ?? []).map(async (list) => {
          const { count } = await supabase.from('external_contacts').select('id', { count: 'exact', head: true }).eq('list_id', list.id);
          return { ...list, contact_count: count ?? 0 };
        }));
        setLists(counts);
      }
      if (!templateResult.error) setTemplates(templateResult.data ?? []);
    })();
  }, [toast]);

  const localRows = useMemo(
    () => source === 'manual' ? splitManualRecipients(manualText) : source === 'upload' ? uploadedRows : [],
    [manualText, source, uploadedRows],
  );
  const analyzed = useMemo(() => analyzeRecipients(localRows), [localRows]);
  const localStats = useMemo(() => ({
    total: analyzed.length,
    valid: analyzed.filter((row) => row.validity === 'valid').length,
    invalid: analyzed.filter((row) => row.validity === 'invalid').length,
    duplicate: analyzed.filter((row) => row.validity === 'duplicate').length,
  }), [analyzed]);
  const metrics = useMemo(() => getSmsMetrics(message), [message]);
  const estimatedRecipients = source === 'contact_list'
    ? lists.find((list) => list.id === selectedListId)?.contact_count ?? 0
    : localStats.valid;

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy('file');
    try {
      const rows = await parseContactFile(file);
      if (rows.length > MAX_RECIPIENTS) throw new Error(`A campaign can contain at most ${MAX_RECIPIENTS.toLocaleString()} rows.`);
      setUploadedRows(rows);
      setUploadedFileName(file.name);
      toast({
        title: 'Contact file loaded',
        description: `${rows.length.toLocaleString()} rows are ready. Save them to a contact list if you want to reuse them.`,
      });
    } catch (error) {
      toast({ title: 'Could not read contact file', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function createPreview() {
    if (!campaignName.trim()) return toast({ title: 'Campaign name is required', variant: 'destructive' });
    if (!message.trim()) return toast({ title: 'Message is required', variant: 'destructive' });
    if (metrics.segments > MAX_SEGMENTS) return toast({ title: `Message is limited to ${MAX_SEGMENTS} SMS segments`, variant: 'destructive' });
    if (source === 'contact_list' && !selectedListId) return toast({ title: 'Select a contact list', variant: 'destructive' });
    if (source !== 'contact_list' && localRows.length === 0) return toast({ title: 'Add at least one recipient', variant: 'destructive' });
    if (localRows.length > MAX_RECIPIENTS) return toast({ title: `Recipient limit is ${MAX_RECIPIENTS.toLocaleString()}`, variant: 'destructive' });

    setBusy('preview');
    try {
      const { data, error } = await supabase.functions.invoke('admin-bulk-sms', {
        body: {
          action: 'preview',
          campaign_name: campaignName.trim(),
          message: message.trim(),
          source_type: duplicate ? 'duplicate' : source,
          list_id: source === 'contact_list' ? selectedListId : undefined,
          recipients: source === 'contact_list' ? undefined : localRows,
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Could not prepare campaign'));
      setPreview(data as Preview);
    } catch (error) {
      toast({ title: 'Could not prepare campaign', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  async function queueCampaign() {
    if (!preview) return;
    setBusy('send');
    try {
      const { error } = await supabase.functions.invoke('admin-bulk-sms', {
        body: { action: 'queue', campaign_id: preview.campaign_id },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error, 'Could not queue campaign'));
      toast({ title: 'Campaign queued', description: 'Delivery will continue safely in server-side batches.' });
      navigate('/super-admin/bulk-sms/history', { replace: true });
    } catch (error) {
      toast({ title: 'Could not queue campaign', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><MessageSquareText className="h-6 w-6" /> Bulk SMS</h1>
        <p className="text-sm text-muted-foreground">External Contacts</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Campaign</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign name</Label>
            <Input id="campaign-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} maxLength={160} placeholder="September Retailer Outreach" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recipients</CardTitle></CardHeader>
        <CardContent>
          <Tabs value={source} onValueChange={(value) => setSource(value as typeof source)}>
            <TabsList className="grid w-full max-w-xl grid-cols-3">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="upload">CSV / Excel</TabsTrigger>
              <TabsTrigger value="contact_list">Contact list</TabsTrigger>
            </TabsList>
            <TabsContent value="manual" className="space-y-3 pt-3">
              <Label htmlFor="manual-numbers">Phone numbers</Label>
              <Textarea id="manual-numbers" value={manualText} onChange={(event) => setManualText(event.target.value)} rows={8} placeholder={'0241234567\n+233551234567; +233201234567'} />
              <p className="text-xs text-muted-foreground">Separate numbers with commas, semicolons, or new lines.</p>
            </TabsContent>
            <TabsContent value="upload" className="space-y-4 pt-3">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 hover:bg-muted/40">
                {busy === 'file' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                <span className="text-sm font-medium">{uploadedFileName || 'Choose CSV or XLSX file'}</span>
                <span className="text-xs text-muted-foreground">Recognizes phone and email columns; each channel can be saved to its own external list.</span>
                <input className="sr-only" type="file" accept=".csv,.xlsx" onChange={handleFile} />
              </label>
            </TabsContent>
            <TabsContent value="contact_list" className="space-y-3 pt-3">
              <Label>External contact list</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger className="max-w-xl"><SelectValue placeholder="Select a list" /></SelectTrigger>
                <SelectContent>{lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name} ({list.contact_count ?? 0})</SelectItem>)}</SelectContent>
              </Select>
              {!lists.length && <Button variant="outline" onClick={() => navigate('/super-admin/external-contacts')}>Create a contact list</Button>}
            </TabsContent>
          </Tabs>

          {source !== 'contact_list' && localStats.total > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Stat label="Total rows" value={localStats.total} />
              <Stat label="Valid" value={localStats.valid} tone="success" />
              <Stat label="Invalid" value={localStats.invalid} tone={localStats.invalid ? 'danger' : undefined} />
              <Stat label="Duplicates" value={localStats.duplicate} tone={localStats.duplicate ? 'warning' : undefined} />
            </div>
          )}
          {source === 'upload' && uploadedRows.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Keep phone and email contacts for future campaigns</p>
                <p className="text-xs text-muted-foreground">Phone numbers and email addresses are reviewed and saved to separate external lists.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/super-admin/external-contacts', {
                  state: { importRows: uploadedRows, importFile: uploadedFileName },
                })}
              >
                Save phone & email contacts
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Message</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-2 sm:w-80">
              <Label>Use template</Label>
              <Select onValueChange={(id) => setMessage(templates.find((template) => template.id === id)?.message ?? '')}>
                <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                <SelectContent>{templates.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => navigate('/super-admin/bulk-sms/templates')}>Manage templates</Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sms-message">SMS message</Label>
            <Textarea id="sms-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={7} maxLength={1600} placeholder="Write the message recipients will receive." />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">{metrics.characters} characters</Badge>
            <Badge variant="outline">{metrics.encoding === 'gsm7' ? 'GSM-7' : 'Unicode'}</Badge>
            <Badge variant={metrics.segments > MAX_SEGMENTS ? 'destructive' : 'outline'}>{metrics.segments} segment{metrics.segments === 1 ? '' : 's'} per recipient</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Estimated recipients" value={estimatedRecipients} />
          <Stat label="Message length" value={`${metrics.characters} chars`} />
          <Stat label="Segments per recipient" value={metrics.segments} />
          <Stat label="Estimated total SMS" value={estimatedRecipients * metrics.segments} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" disabled title="Server-side scheduling is not configured yet"><CalendarClock className="mr-2 h-4 w-4" /> Schedule for later</Button>
        <Button onClick={createPreview} disabled={busy !== null}><FileSpreadsheet className="mr-2 h-4 w-4" />{busy === 'preview' ? 'Preparing…' : 'Preview campaign'}</Button>
      </div>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open && busy !== 'send') setPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm bulk SMS campaign</DialogTitle>
            <DialogDescription>Review the final server-validated audience before messages are queued.</DialogDescription>
          </DialogHeader>
          {preview && <div className="space-y-5">
            <div><p className="text-xs text-muted-foreground">Campaign</p><p className="font-semibold">{campaignName}</p></div>
            <div className="rounded-md border border-border bg-muted/30 p-4 whitespace-pre-wrap text-sm">{message.trim()}</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Final recipients" value={preview.recipient_count} tone="success" />
              <Stat label="Invalid" value={preview.invalid_numbers} tone={preview.invalid_numbers ? 'danger' : undefined} />
              <Stat label="Duplicates" value={preview.duplicate_numbers} tone={preview.duplicate_numbers ? 'warning' : undefined} />
              <Stat label="Do Not SMS" value={preview.excluded_numbers} />
              <Stat label="Segments / recipient" value={preview.segments_per_recipient} />
              <Stat label="Estimated total SMS" value={preview.estimated_total_segments} />
            </div>
            <div className="grid gap-3 rounded-md border border-border p-4 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">Provider: </span>{preview.provider}</div>
              <div><span className="text-muted-foreground">Sender: </span>{preview.sender_id}</div>
              <div><span className="text-muted-foreground">Encoding: </span>{preview.encoding === 'gsm7' ? 'GSM-7' : 'Unicode'}</div>
              <div><span className="text-muted-foreground">Estimated cost: </span>{preview.estimated_cost == null ? 'Available after provider acceptance' : preview.estimated_cost}</div>
            </div>
            {preview.recipient_count === 0 && <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /> No sendable recipients remain after validation.</div>}
          </div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)} disabled={busy === 'send'}>Cancel</Button>
            <Button onClick={queueCampaign} disabled={busy === 'send' || !preview?.recipient_count}><Send className="mr-2 h-4 w-4" />{busy === 'send' ? 'Queuing…' : 'Send Bulk SMS'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'success' | 'danger' | 'warning' }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? AlertCircle : tone === 'warning' ? AlertCircle : Users;
  const color = tone === 'success' ? 'text-emerald-600' : tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600' : 'text-foreground';
  return <div className="rounded-md border border-border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className={`h-3.5 w-3.5 ${color}`} />{label}</div><p className={`mt-1 text-lg font-semibold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</p></div>;
}
