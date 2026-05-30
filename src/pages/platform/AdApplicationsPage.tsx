import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Loader2, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

type AdAppRow = {
  id: string; business_name: string; contact_name: string; email: string;
  phone: string | null; business_type: string | null; ad_goal: string | null;
  budget: string | null; message: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'contacted'; created_at: string;
};

export default function PlatformAdApplicationsPage() {
  const [rows, setRows] = useState<AdAppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | AdAppRow['status']>('all');

  const load = async () => {
    const { data, error } = await supabase
      .from('ad_applications').select('*').order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as AdAppRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('platform:ad_applications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ad_applications' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const setStatus = async (id: string, status: AdAppRow['status']) => {
    const { error } = await supabase
      .from('ad_applications')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) toast.error(error.message); else toast.success('Updated');
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this application?')) return;
    const { error } = await supabase.from('ad_applications').delete().eq('id', id);
    if (error) toast.error(error.message); else toast.success('Deleted');
  };

  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const pending = rows.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Ad Applications</h1>
          <p className="text-sm text-muted-foreground">Businesses applying to advertise on KudiTrack.</p>
        </div>
        <div className="flex items-center gap-3">
          {pending > 0 && <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">{pending} pending</Badge>}
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="contacted">Contacted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No applications.</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {visible.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{r.business_name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.contact_name} · {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-2 text-xs">
                  <Detail label="Email" value={r.email} />
                  <Detail label="Phone" value={r.phone || '—'} />
                  <Detail label="Business Type" value={r.business_type || '—'} />
                  <Detail label="Ad Goal" value={r.ad_goal || '—'} />
                  <Detail label="Budget" value={r.budget || '—'} />
                </div>
                {r.message && (
                  <div className="text-sm whitespace-pre-wrap border-l-2 border-violet-500/40 pl-3 text-foreground/80">
                    {r.message}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" asChild>
                    <a href={`mailto:${r.email}?subject=Re: Advertising on KudiTrack`}>
                      <Mail className="h-3.5 w-3.5 mr-1.5" /> Email
                    </a>
                  </Button>
                  {r.phone && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`tel:${r.phone}`}><Phone className="h-3.5 w-3.5 mr-1.5" /> Call</a>
                    </Button>
                  )}
                  {r.status !== 'contacted' && (
                    <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'contacted')}>Mark Contacted</Button>
                  )}
                  {r.status !== 'approved' && (
                    <Button size="sm" onClick={() => setStatus(r.id, 'approved')}>Approve</Button>
                  )}
                  {r.status !== 'rejected' && (
                    <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'rejected')}>Reject</Button>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="uppercase tracking-widest text-[10px] text-muted-foreground">{label}</span>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AdAppRow['status'] }) {
  const map = {
    pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    contacted: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  } as const;
  return <Badge variant="outline" className={map[status]}>{status}</Badge>;
}
