import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Mail, Send, FileText, Image as ImageIcon, Users, Calendar, MailX,
  BarChart3, Plus, Trash2, Copy, Eye, Play, X,
} from 'lucide-react';

type Campaign = {
  id: string;
  name: string;
  subject: string;
  preview_text: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  body_html: string;
  audience_type: string;
  audience_filter: any;
  recipient_count: number;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_count: number;
  open_count: number;
  unique_open_count: number;
  click_count: number;
  unique_click_count: number;
  bounce_count: number;
  unsubscribe_count: number;
  failed_count: number;
  template_id: string | null;
  created_at: string;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  subject: string;
  preview_text: string | null;
  body_html: string;
  is_system: boolean;
};

const AUDIENCE_OPTIONS = [
  { value: 'all_users', label: 'All registered users' },
  { value: 'active', label: 'Active subscribers' },
  { value: 'trial_users', label: 'Trial users' },
  { value: 'expired', label: 'Expired subscribers' },
  { value: 'canceled', label: 'Cancelled subscribers' },
  { value: 'starter', label: 'Starter plan' },
  { value: 'business', label: 'Business plan' },
  { value: 'business_plus', label: 'Business Plus plan' },
  { value: 'specific_emails', label: 'Specific email addresses' },
];

const PLACEHOLDERS = [
  '{{first_name}}', '{{business_name}}', '{{owner_name}}',
  '{{subscription_plan}}', '{{expiry_date}}', '{{store_link}}',
];

const emptyCampaign = (): Partial<Campaign> => ({
  name: 'Untitled campaign',
  subject: '',
  preview_text: '',
  from_name: 'KudiTrack Team',
  from_email: 'news@kuditrack.online',
  reply_to: '',
  body_html: '<p>Hi {{first_name}},</p><p>Write your message here.</p><p>— KudiTrack Team</p>',
  audience_type: 'all_users',
  audience_filter: {},
  status: 'draft',
});

export default function EmailCenterPage() {
  const [tab, setTab] = useState('overview');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [unsubs, setUnsubs] = useState<Array<{ email: string; created_at: string }>>([]);
  const [media, setMedia] = useState<Array<{ id: string; name: string; url: string; kind: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<Partial<Campaign> | null>(null);
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [scheduledMode, setScheduledMode] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [specificEmailsText, setSpecificEmailsText] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const [c, t, u, m] = await Promise.all([
      supabase.from('email_campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('email_templates').select('*').order('is_system', { ascending: false }).order('name'),
      supabase.from('email_marketing_unsubscribes').select('email, created_at').order('created_at', { ascending: false }).limit(200),
      supabase.from('email_media_library').select('id, name, url, kind').order('created_at', { ascending: false }),
    ]);
    setCampaigns((c.data as any) ?? []);
    setTemplates((t.data as any) ?? []);
    setUnsubs((u.data as any) ?? []);
    setMedia((m.data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const totalRecipients = campaigns.reduce((sum, c) => sum + (c.recipient_count ?? 0), 0);
    const totalOpens = campaigns.reduce((sum, c) => sum + (c.unique_open_count ?? 0), 0);
    const totalClicks = campaigns.reduce((sum, c) => sum + (c.unique_click_count ?? 0), 0);
    return {
      totalCampaigns: campaigns.filter((c) => c.status === 'sent').length,
      draftCount: campaigns.filter((c) => c.status === 'draft').length,
      scheduledCount: campaigns.filter((c) => c.status === 'scheduled').length,
      failedCount: campaigns.reduce((s, c) => s + (c.failed_count ?? 0), 0),
      sentToday: campaigns.filter((c) => c.sent_at && c.sent_at >= todayStart).reduce((s, c) => s + (c.delivered_count ?? 0), 0),
      openRate: totalRecipients ? Math.round((totalOpens / totalRecipients) * 100) : 0,
      clickRate: totalRecipients ? Math.round((totalClicks / totalRecipients) * 100) : 0,
      unsubTotal: unsubs.length,
    };
  }, [campaigns, unsubs]);

  const previewAudience = useCallback(async (c: Partial<Campaign>) => {
    const filter = { ...(c.audience_filter || {}) };
    if (c.audience_type === 'specific_emails') {
      filter.emails = specificEmailsText.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    const { data, error } = await supabase.functions.invoke('admin-email-audience-preview', {
      body: { audience_type: c.audience_type, audience_filter: filter },
    });
    if (error) { toast.error('Could not preview audience'); return; }
    setAudienceCount(((data as any)?.count) ?? 0);
  }, [specificEmailsText]);

  const saveCampaign = async (c: Partial<Campaign>, status?: string) => {
    const filter = { ...(c.audience_filter || {}) };
    if (c.audience_type === 'specific_emails') {
      filter.emails = specificEmailsText.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
    }
    const payload: any = {
      name: c.name, subject: c.subject, preview_text: c.preview_text,
      from_name: c.from_name, from_email: c.from_email, reply_to: c.reply_to || null,
      body_html: c.body_html, audience_type: c.audience_type, audience_filter: filter,
      status: status ?? c.status ?? 'draft',
      scheduled_at: status === 'scheduled' ? scheduledAt : c.scheduled_at ?? null,
      template_id: c.template_id ?? null,
    };
    if (c.id) {
      const { error } = await supabase.from('email_campaigns').update(payload).eq('id', c.id);
      if (error) throw error;
      return c.id;
    }
    const { data: user } = await supabase.auth.getUser();
    payload.created_by = user.user?.id;
    const { data, error } = await supabase.from('email_campaigns').insert(payload).select('id').single();
    if (error) throw error;
    return data!.id as string;
  };

  const sendCampaign = async (c: Partial<Campaign>) => {
    if (!c.subject || !c.body_html) { toast.error('Subject and body are required'); return; }
    try {
      const id = await saveCampaign(c, scheduledMode === 'schedule' ? 'scheduled' : 'draft');
      if (scheduledMode === 'schedule') {
        toast.success('Campaign scheduled');
        setEditor(null); void refresh(); return;
      }
      const { data, error } = await supabase.functions.invoke('admin-email-send-campaign', {
        body: { action: 'send', campaign_id: id },
      });
      if (error) throw error;
      toast.success(`Sent to ${(data as any)?.sent ?? 0} recipients`);
      setEditor(null); void refresh();
    } catch (e) { toast.error((e as Error).message); }
  };

  const testSend = async (c: Partial<Campaign>) => {
    if (!testEmail) return;
    try {
      const id = await saveCampaign(c, 'draft');
      const { error } = await supabase.functions.invoke('admin-email-send-campaign', {
        body: { action: 'test', campaign_id: id, to: [testEmail] },
      });
      if (error) throw error;
      toast.success(`Test sent to ${testEmail}`);
    } catch (e) { toast.error((e as Error).message); }
  };

  const duplicateCampaign = async (c: Campaign) => {
    const { data: user } = await supabase.auth.getUser();
    const { error } = await supabase.from('email_campaigns').insert({
      name: `${c.name} (copy)`, subject: c.subject, preview_text: c.preview_text,
      from_name: c.from_name, from_email: c.from_email, reply_to: c.reply_to,
      body_html: c.body_html, audience_type: c.audience_type, audience_filter: c.audience_filter,
      status: 'draft', created_by: user.user?.id,
    });
    if (error) toast.error(error.message); else { toast.success('Duplicated'); void refresh(); }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm('Delete this campaign?')) return;
    const { error } = await supabase.from('email_campaigns').delete().eq('id', id);
    if (error) toast.error(error.message); else void refresh();
  };

  const cancelScheduled = async (id: string) => {
    const { error } = await supabase.from('email_campaigns').update({ status: 'draft', scheduled_at: null }).eq('id', id);
    if (error) toast.error(error.message); else void refresh();
  };

  const uploadMedia = async (file: File) => {
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('email-media').upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); return; }
    const { data: signed } = await supabase.storage.from('email-media').createSignedUrl(path, 60 * 60 * 24 * 365);
    if (!signed?.signedUrl) { toast.error('Could not sign URL'); return; }
    const { data: user } = await supabase.auth.getUser();
    await supabase.from('email_media_library').insert({
      name: file.name, url: signed.signedUrl, storage_path: path,
      mime_type: file.type, size_bytes: file.size,
      kind: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other',
      created_by: user.user?.id,
    });
    toast.success('Uploaded');
    void refresh();
  };

  const insertIntoEditor = (snippet: string) => {
    setEditor((prev) => prev ? { ...prev, body_html: (prev.body_html ?? '') + snippet } : prev);
  };

  const openNew = (tpl?: Template) => {
    const base = emptyCampaign();
    if (tpl) {
      base.name = tpl.name;
      base.subject = tpl.subject;
      base.preview_text = tpl.preview_text ?? '';
      base.body_html = tpl.body_html;
      base.template_id = tpl.id;
    }
    setEditor(base);
    setAudienceCount(null);
    setScheduledMode('now');
    setScheduledAt('');
    setSpecificEmailsText('');
    setTab('compose');
  };

  const openEdit = (c: Campaign) => {
    setEditor(c);
    setSpecificEmailsText((c.audience_filter?.emails ?? []).join('\n'));
    setScheduledMode(c.scheduled_at ? 'schedule' : 'now');
    setScheduledAt(c.scheduled_at ?? '');
    setAudienceCount(c.recipient_count || null);
    setTab('compose');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6" /> Email & Newsletter</h1>
          <p className="text-sm text-muted-foreground">Bulk email campaigns to your KudiTrack users.</p>
        </div>
        <Button onClick={() => openNew()}><Plus className="h-4 w-4 mr-1" /> New campaign</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="media">Media</TabsTrigger>
          <TabsTrigger value="unsubs">Unsubscribes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Send className="h-4 w-4" />} label="Sent today" value={stats.sentToday} />
            <StatCard icon={<Mail className="h-4 w-4" />} label="Campaigns sent" value={stats.totalCampaigns} />
            <StatCard icon={<Calendar className="h-4 w-4" />} label="Scheduled" value={stats.scheduledCount} />
            <StatCard icon={<FileText className="h-4 w-4" />} label="Drafts" value={stats.draftCount} />
            <StatCard icon={<Eye className="h-4 w-4" />} label="Open rate" value={`${stats.openRate}%`} />
            <StatCard icon={<BarChart3 className="h-4 w-4" />} label="Click rate" value={`${stats.clickRate}%`} />
            <StatCard icon={<MailX className="h-4 w-4" />} label="Unsubscribes" value={stats.unsubTotal} />
            <StatCard icon={<X className="h-4 w-4" />} label="Failed" value={stats.failedCount} />
          </div>

          <Card className="p-4">
            <h3 className="font-semibold mb-3">Recent campaigns</h3>
            <div className="divide-y">
              {campaigns.slice(0, 6).map((c) => (
                <div key={c.id} className="py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.subject}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
              {campaigns.length === 0 && <p className="text-sm text-muted-foreground py-3">No campaigns yet.</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="compose">
          {editor ? (
            <ComposeEditor
              value={editor}
              onChange={setEditor}
              audienceCount={audienceCount}
              onPreviewAudience={() => previewAudience(editor)}
              onSaveDraft={async () => { try { await saveCampaign(editor, 'draft'); toast.success('Draft saved'); void refresh(); } catch (e) { toast.error((e as Error).message); } }}
              onSend={() => sendCampaign(editor)}
              onTestSend={() => testSend(editor)}
              testEmail={testEmail}
              onTestEmailChange={setTestEmail}
              scheduledMode={scheduledMode}
              onScheduledModeChange={setScheduledMode}
              scheduledAt={scheduledAt}
              onScheduledAtChange={setScheduledAt}
              specificEmailsText={specificEmailsText}
              onSpecificEmailsChange={setSpecificEmailsText}
              media={media}
              onInsertSnippet={insertIntoEditor}
            />
          ) : (
            <Card className="p-8 text-center space-y-3">
              <p className="text-muted-foreground">Start a new campaign or pick a template.</p>
              <Button onClick={() => openNew()}><Plus className="h-4 w-4 mr-1" /> New campaign</Button>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {campaigns.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold truncate">{c.name}</h4>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{c.subject}</p>
                  <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-3">
                    <span>Audience: {c.audience_type}</span>
                    <span>Recipients: {c.recipient_count}</span>
                    <span>Delivered: {c.delivered_count}</span>
                    <span>Opens: {c.unique_open_count}</span>
                    <span>Clicks: {c.unique_click_count}</span>
                    <span>Unsubs: {c.unsubscribe_count}</span>
                    <span>Failed: {c.failed_count}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Edit</Button>
                  )}
                  {c.status === 'scheduled' && (
                    <Button size="sm" variant="outline" onClick={() => cancelScheduled(c.id)}>Cancel</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => duplicateCampaign(c)}><Copy className="h-3.5 w-3.5" /></Button>
                  {c.status !== 'sending' && (
                    <Button size="sm" variant="ghost" onClick={() => deleteCampaign(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
          {!loading && campaigns.length === 0 && <p className="text-sm text-muted-foreground">No campaigns yet.</p>}
        </TabsContent>

        <TabsContent value="templates" className="space-y-3">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {templates.map((t) => (
              <Card key={t.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">{t.name}</h4>
                  {t.is_system && <Badge variant="secondary" className="text-xs">System</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <p className="text-xs text-muted-foreground truncate">Subject: {t.subject}</p>
                <Button size="sm" className="w-full" onClick={() => openNew(t)}>
                  <Play className="h-3.5 w-3.5 mr-1" /> Use template
                </Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="media" className="space-y-3">
          <Card className="p-4">
            <Label className="text-sm">Upload image, logo, GIF, banner, PDF or video</Label>
            <Input
              type="file"
              accept="image/*,application/pdf,video/*"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadMedia(f); }}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-2">Files are stored securely. Emails receive a 1-year signed URL.</p>
          </Card>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {media.map((m) => (
              <Card key={m.id} className="p-3 space-y-2">
                {m.kind === 'image' ? (
                  <img src={m.url} alt={m.name} className="w-full h-24 object-cover rounded" />
                ) : (
                  <div className="w-full h-24 flex items-center justify-center bg-muted rounded"><ImageIcon className="h-8 w-8 text-muted-foreground" /></div>
                )}
                <p className="text-xs truncate">{m.name}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => { navigator.clipboard.writeText(m.url); toast.success('URL copied'); }}>Copy URL</Button>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => insertIntoEditor(m.kind === 'image' ? `<img src="${m.url}" alt="${m.name}" style="max-width:100%;" />` : `<a href="${m.url}">${m.name}</a>`)}>Insert</Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="unsubs">
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Marketing unsubscribes ({unsubs.length})</h3>
            <p className="text-xs text-muted-foreground mb-3">These addresses are excluded from marketing campaigns. Transactional emails (OTPs, receipts, order updates, security alerts) still send.</p>
            <div className="divide-y max-h-96 overflow-auto">
              {unsubs.map((u) => (
                <div key={u.email} className="py-2 flex items-center justify-between text-sm">
                  <span>{u.email}</span>
                  <span className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()}</span>
                </div>
              ))}
              {unsubs.length === 0 && <p className="text-sm text-muted-foreground">No unsubscribes yet.</p>}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs uppercase tracking-widest">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    scheduled: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    sending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    sent: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    archived: 'bg-muted text-muted-foreground',
  };
  return <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded ${map[status] ?? 'bg-muted'}`}>{status}</span>;
}

function ComposeEditor(props: {
  value: Partial<Campaign>;
  onChange: (v: Partial<Campaign>) => void;
  audienceCount: number | null;
  onPreviewAudience: () => void;
  onSaveDraft: () => void;
  onSend: () => void;
  onTestSend: () => void;
  testEmail: string;
  onTestEmailChange: (v: string) => void;
  scheduledMode: 'now' | 'schedule';
  onScheduledModeChange: (v: 'now' | 'schedule') => void;
  scheduledAt: string;
  onScheduledAtChange: (v: string) => void;
  specificEmailsText: string;
  onSpecificEmailsChange: (v: string) => void;
  media: Array<{ id: string; url: string; name: string; kind: string }>;
  onInsertSnippet: (s: string) => void;
}) {
  const c = props.value;
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3">
        <Card className="p-4 space-y-3">
          <div>
            <Label>Campaign name (internal)</Label>
            <Input value={c.name ?? ''} onChange={(e) => props.onChange({ ...c, name: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>From name</Label>
              <Input value={c.from_name ?? ''} onChange={(e) => props.onChange({ ...c, from_name: e.target.value })} />
            </div>
            <div>
              <Label>From email</Label>
              <Input value={c.from_email ?? ''} onChange={(e) => props.onChange({ ...c, from_email: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Reply-to (optional)</Label>
            <Input value={c.reply_to ?? ''} onChange={(e) => props.onChange({ ...c, reply_to: e.target.value })} />
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={c.subject ?? ''} onChange={(e) => props.onChange({ ...c, subject: e.target.value })} />
          </div>
          <div>
            <Label>Preview text</Label>
            <Input value={c.preview_text ?? ''} onChange={(e) => props.onChange({ ...c, preview_text: e.target.value })} />
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Body (HTML)</Label>
            <div className="flex gap-1 flex-wrap">
              {PLACEHOLDERS.map((p) => (
                <Button key={p} size="sm" variant="outline" className="text-[10px] h-7" onClick={() => props.onInsertSnippet(p)}>{p}</Button>
              ))}
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => props.onInsertSnippet('<strong>bold</strong>')}>B</Button>
            <Button size="sm" variant="outline" onClick={() => props.onInsertSnippet('<em>italic</em>')}>I</Button>
            <Button size="sm" variant="outline" onClick={() => props.onInsertSnippet('<u>underline</u>')}>U</Button>
            <Button size="sm" variant="outline" onClick={() => props.onInsertSnippet('<ul><li>item</li></ul>')}>List</Button>
            <Button size="sm" variant="outline" onClick={() => props.onInsertSnippet('<a href="https://kuditrack.online" style="color:#3B82F6;">link</a>')}>Link</Button>
            <Button size="sm" variant="outline" onClick={() => props.onInsertSnippet('<a href="https://kuditrack.online" style="display:inline-block;padding:12px 20px;background:#3B82F6;color:#fff;text-decoration:none;border-radius:8px;">Button</a>')}>Button</Button>
            <Button size="sm" variant="outline" onClick={() => props.onInsertSnippet('<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />')}>HR</Button>
            <Button size="sm" variant="outline" onClick={() => props.onInsertSnippet('<table style="width:100%;border-collapse:collapse;"><tr><td style="padding:8px;border:1px solid #e5e7eb;">Cell</td></tr></table>')}>Table</Button>
          </div>
          <Textarea
            className="font-mono text-xs"
            rows={16}
            value={c.body_html ?? ''}
            onChange={(e) => props.onChange({ ...c, body_html: e.target.value })}
          />
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}><Eye className="h-3.5 w-3.5 mr-1" /> Preview</Button>
        </Card>
      </div>

      <div className="space-y-3">
        <Card className="p-4 space-y-3">
          <Label className="flex items-center gap-1"><Users className="h-4 w-4" /> Audience</Label>
          <Select value={c.audience_type ?? 'all_users'} onValueChange={(v) => props.onChange({ ...c, audience_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AUDIENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {c.audience_type === 'specific_emails' && (
            <Textarea
              rows={4}
              placeholder="one@example.com, two@example.com"
              value={props.specificEmailsText}
              onChange={(e) => props.onSpecificEmailsChange(e.target.value)}
            />
          )}
          <Button variant="outline" size="sm" onClick={props.onPreviewAudience}>Preview count</Button>
          {props.audienceCount !== null && (
            <p className="text-sm">Recipients: <span className="font-semibold">{props.audienceCount.toLocaleString()}</span></p>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <Label className="flex items-center gap-1"><Calendar className="h-4 w-4" /> Delivery</Label>
          <Select value={props.scheduledMode} onValueChange={(v) => props.onScheduledModeChange(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="now">Send immediately</SelectItem>
              <SelectItem value="schedule">Schedule</SelectItem>
            </SelectContent>
          </Select>
          {props.scheduledMode === 'schedule' && (
            <Input type="datetime-local" value={props.scheduledAt.slice(0, 16)} onChange={(e) => props.onScheduledAtChange(new Date(e.target.value).toISOString())} />
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <Label>Send test email</Label>
          <Input placeholder="test@you.com" value={props.testEmail} onChange={(e) => props.onTestEmailChange(e.target.value)} />
          <Button size="sm" variant="outline" onClick={props.onTestSend}>Send test</Button>
        </Card>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={props.onSaveDraft}>Save draft</Button>
          <Button className="flex-1" onClick={props.onSend}>
            <Send className="h-4 w-4 mr-1" />
            {props.scheduledMode === 'schedule' ? 'Schedule' : 'Send now'}
          </Button>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>{c.subject || 'Preview'}</DialogTitle></DialogHeader>
          <div className="border rounded p-4 bg-white text-black" dangerouslySetInnerHTML={{ __html: c.body_html ?? '' }} />
          <DialogFooter><Button onClick={() => setPreviewOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
