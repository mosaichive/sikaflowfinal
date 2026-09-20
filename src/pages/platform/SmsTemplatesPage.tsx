import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getSmsMetrics } from '@/lib/bulk-sms';
import { logPlatformAction } from '@/lib/platform-audit';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Pencil, Plus, Send, Trash2 } from 'lucide-react';

type Template = { id: string; name: string; message: string; created_at: string; updated_at: string };

export default function SmsTemplatesPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editor, setEditor] = useState<Partial<Template> | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('sms_templates').select('*').order('updated_at', { ascending: false });
    if (error) toast({ title: 'Could not load templates', description: error.message, variant: 'destructive' });
    else setTemplates((data ?? []) as Template[]);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const metrics = useMemo(() => getSmsMetrics(editor?.message ?? ''), [editor?.message]);

  async function save() {
    if (!editor?.name?.trim() || !editor.message?.trim()) return toast({ title: 'Name and message are required', variant: 'destructive' });
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const payload = { name: editor.name.trim(), message: editor.message.trim(), created_by: userData.user!.id };
    const result = editor.id
      ? await supabase.from('sms_templates').update(payload).eq('id', editor.id)
      : await supabase.from('sms_templates').insert(payload);
    setBusy(false);
    if (result.error) return toast({ title: 'Could not save template', description: result.error.message, variant: 'destructive' });
    await logPlatformAction(editor.id ? 'sms_template_updated' : 'sms_template_created', { template_id: editor.id ?? null, name: payload.name });
    setEditor(null);
    await load();
  }

  async function remove() {
    if (!deleting) return;
    const { error } = await supabase.from('sms_templates').delete().eq('id', deleting.id);
    if (error) return toast({ title: 'Could not delete template', description: error.message, variant: 'destructive' });
    await logPlatformAction('sms_template_deleted', { template_id: deleting.id, name: deleting.name });
    setDeleting(null);
    await load();
  }

  function applyTemplate(template: Template) {
    navigate('/super-admin/bulk-sms', { state: { prefillMessage: template.message } });
  }

  return <div className="space-y-6 max-w-6xl">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><FileText className="h-6 w-6" /> SMS Templates</h1><p className="text-sm text-muted-foreground">Reusable messages for external-contact campaigns.</p></div><Button onClick={() => setEditor({ name: '', message: '' })}><Plus className="mr-2 h-4 w-4" /> New template</Button></div>
    <div className="overflow-hidden rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Message</TableHead><TableHead>Created</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
      {templates.length === 0 ? <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No SMS templates yet.</TableCell></TableRow> : templates.map((template) => <TableRow key={template.id}><TableCell className="font-medium">{template.name}</TableCell><TableCell className="max-w-md truncate">{template.message}</TableCell><TableCell>{new Date(template.created_at).toLocaleDateString()}</TableCell><TableCell>{new Date(template.updated_at).toLocaleDateString()}</TableCell><TableCell className="text-right"><Button size="icon" variant="ghost" title="Use template" onClick={() => applyTemplate(template)}><Send className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Edit template" onClick={() => setEditor(template)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" title="Delete template" onClick={() => setDeleting(template)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}
    </TableBody></Table></div>

    <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null); }}><DialogContent><DialogHeader><DialogTitle>{editor?.id ? 'Edit SMS template' : 'Create SMS template'}</DialogTitle></DialogHeader>{editor && <div className="space-y-4"><div className="space-y-2"><Label>Name</Label><Input value={editor.name ?? ''} maxLength={120} onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))} /></div><div className="space-y-2"><Label>Message</Label><Textarea rows={8} maxLength={1600} value={editor.message ?? ''} onChange={(event) => setEditor((current) => ({ ...current, message: event.target.value }))} /><p className="text-xs text-muted-foreground">{metrics.characters} characters · {metrics.segments} SMS segment{metrics.segments === 1 ? '' : 's'} · {metrics.encoding === 'gsm7' ? 'GSM-7' : 'Unicode'}</p></div></div>}<DialogFooter><Button variant="outline" onClick={() => setEditor(null)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save template'}</Button></DialogFooter></DialogContent></Dialog>

    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>Existing campaign history will not be changed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={remove}>Delete template</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
