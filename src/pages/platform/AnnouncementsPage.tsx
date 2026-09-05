import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2 } from 'lucide-react';

type Row = {
  id: string;
  title: string;
  body: string;
  level: string;
  audience: string;
  starts_at: string;
  created_at: string;
};

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('info');
  const [audience, setAudience] = useState('all_tenants');
  const [publishAt, setPublishAt] = useState(new Date().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('platform_announcements').select('*').order('created_at', { ascending: false });
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase.channel('platform-anns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_announcements' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const create = async () => {
    if (!title.trim()) return toast({ title: 'Title required', variant: 'destructive' });
    setSubmitting(true);
    const payload = {
      title: title.trim(),
      body: message.trim(),
      level: priority,
      audience,
      starts_at: new Date(publishAt).toISOString(),
      created_by: user?.id,
    };
    const { error } = await supabase.from('platform_announcements').insert(payload);
    setSubmitting(false);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    setTitle(''); setMessage('');
    toast({ title: 'Announcement published' });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this announcement?')) return;
    const { error } = await supabase.from('platform_announcements').delete().eq('id', id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Announcements</h1>
        <p className="text-sm text-muted-foreground">Publish notices to tenants.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Compose</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Message</Label>
            <Textarea rows={3} maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Normal</SelectItem>
                  <SelectItem value="warning">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_tenants">All tenants</SelectItem>
                  <SelectItem value="trial">Trial users</SelectItem>
                  <SelectItem value="paid">Paid subscribers</SelectItem>
                  <SelectItem value="expired">Expired subscribers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Publish at</Label>
              <Input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            </div>
          </div>
          <Button onClick={create} disabled={submitting}>{submitting ? 'Publishing…' : 'Publish'}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Existing Announcements</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No announcements yet.</p>}
          {rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">{row.level}</Badge>
                  <span className="text-[10px] text-muted-foreground">→ {row.audience}</span>
                </div>
                <p className="text-sm font-semibold truncate">{row.title}</p>
                {row.body && <p className="text-xs text-muted-foreground line-clamp-2">{row.body}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">{new Date(row.starts_at).toLocaleString()}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(row.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
