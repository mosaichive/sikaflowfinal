import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Check, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';

type FeedbackRow = {
  id: string; name: string; email: string; subject: string; message: string;
  status: 'new' | 'in_progress' | 'resolved'; created_at: string; resolved_at: string | null;
};

export default function PlatformFeedbackPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'new' | 'in_progress' | 'resolved'>('all');

  const load = async () => {
    const { data, error } = await supabase
      .from('feedback_messages').select('*').order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as FeedbackRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('platform:feedback')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback_messages' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const setStatus = async (id: string, status: FeedbackRow['status']) => {
    const { error } = await supabase
      .from('feedback_messages')
      .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
      .eq('id', id);
    if (error) toast.error(error.message); else toast.success('Updated');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this message?')) return;
    const { error } = await supabase.from('feedback_messages').delete().eq('id', id);
    if (error) toast.error(error.message); else toast.success('Deleted');
  };

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const unread = rows.filter((r) => r.status === 'new').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Feedback</h1>
          <p className="text-sm text-muted-foreground">Messages from the public landing page.</p>
        </div>
        <div className="flex items-center gap-3">
          {unread > 0 && <Badge className="border border-[rgba(81,193,31,0.25)] bg-[rgba(81,193,31,0.12)] text-[#51C11F]">{unread} unread</Badge>}
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No messages.</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {visible.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{r.subject || '(no subject)'}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.name} · <a href={`mailto:${r.email}`} className="hover:underline">{r.email}</a> · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <a href={`mailto:${r.email}?subject=Re: ${encodeURIComponent(r.subject || 'Your message')}`}>
                      <Mail className="h-3.5 w-3.5 mr-1.5" /> Reply
                    </a>
                  </Button>
                  {r.status !== 'in_progress' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'in_progress')}>Mark In Progress</Button>
                  )}
                  {r.status !== 'resolved' && (
                    <Button size="sm" onClick={() => setStatus(r.id, 'resolved')}>
                      <Check className="h-3.5 w-3.5 mr-1.5" /> Mark Resolved
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: FeedbackRow['status'] }) {
  const map = {
    new: 'bg-[rgba(81,193,31,0.12)] text-[#51C11F] border-[rgba(81,193,31,0.25)]',
    in_progress: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    resolved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  } as const;
  return <Badge variant="outline" className={map[status]}>{status.replace('_', ' ')}</Badge>;
}
