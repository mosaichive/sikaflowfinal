import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Search, Pause, Play, Calendar, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

type Row = {
  id: string;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  suspended: boolean;
  subscription_plan: string;
  subscription_status: string;
  subscription_end_date: string | null;
  trial_end_date: string | null;
};

export default function BusinessesPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [extendOpen, setExtendOpen] = useState<{ id: string; name: string } | null>(null);
  const [extendDays, setExtendDays] = useState(7);
  const [deleteOpen, setDeleteOpen] = useState<{ id: string; name: string; email: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id,business_name,email,phone,location,suspended,subscription_plan,subscription_status,subscription_end_date,trial_end_date')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    setRows((data as Row[]) ?? []);
  }, [toast]);

  useEffect(() => {
    void load();
    const ch = supabase.channel('platform-businesses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const update = async (id: string, payload: Record<string, unknown>, msg: string) => {
    setBusy(true);
    const { error } = await supabase.from('profiles').update(payload).eq('id', id);
    setBusy(false);
    if (error) {
      toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
      return false;
    }
    toast({ title: msg });
    await load();
    return true;
  };

  const filtered = rows.filter((r) => {
    if (search && !(r.business_name || '').toLowerCase().includes(search.toLowerCase()) && !(r.email || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (planFilter !== 'all' && r.subscription_plan !== planFilter) return false;
    if (statusFilter !== 'all' && r.subscription_status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
        <p className="text-sm text-muted-foreground">Manage every tenant on the platform.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-3 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
                <SelectItem value="lifetime">Lifetime</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Renews</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const renew = r.trial_end_date ?? r.subscription_end_date;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.business_name || '—'}</div>
                        <div className="text-[10px] text-muted-foreground">{r.location || '—'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-[11px]">{r.email}</div>
                        <div className="text-[10px] text-muted-foreground">{r.phone}</div>
                      </td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-[10px]">{r.subscription_plan}</Badge></td>
                      <td className="px-3 py-2">
                        <Badge className="text-[10px]" variant={r.suspended ? 'destructive' : r.subscription_status === 'active' ? 'default' : r.subscription_status === 'trial' ? 'secondary' : 'destructive'}>
                          {r.suspended ? 'suspended' : r.subscription_status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-muted-foreground">{renew ? new Date(renew).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Extend Trial" onClick={() => setExtendOpen({ id: r.id, name: r.business_name || r.email || '' })}>
                            <Calendar className="h-3.5 w-3.5" />
                          </Button>
                          {r.suspended ? (
                            <Button size="sm" variant="ghost" title="Reactivate" disabled={busy} onClick={() => update(r.id, { suspended: false }, 'Reactivated')}>
                              <Play className="h-3.5 w-3.5 text-emerald-500" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" title="Suspend" disabled={busy} onClick={() => update(r.id, { suspended: true }, 'Suspended')}>
                              <Pause className="h-3.5 w-3.5 text-amber-500" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" title="Delete user" disabled={busy} onClick={() => { setDeleteConfirm(''); setDeleteOpen({ id: r.id, name: r.business_name || r.email || '', email: r.email || '' }); }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-sm text-muted-foreground py-10">No businesses match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!extendOpen} onOpenChange={(o) => !o && setExtendOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extend trial for {extendOpen?.name}</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs">Days to add</Label>
            <Input type="number" min={1} max={365} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtendOpen(null)}>Cancel</Button>
            <Button disabled={busy} onClick={async () => {
              if (!extendOpen) return;
              const row = rows.find((r) => r.id === extendOpen.id);
              const base = row?.trial_end_date ? new Date(row.trial_end_date) : new Date();
              const next = new Date(base.getTime() + extendDays * 86400000);
              const ok = await update(extendOpen.id, { trial_end_date: next.toISOString(), subscription_status: 'trial' }, 'Trial extended');
              if (ok) setExtendOpen(null);
            }}>Extend</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteOpen} onOpenChange={(o) => !o && setDeleteOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteOpen?.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the user account, profile, and all business data (sales, products, expenses, etc.).
              The email <span className="font-mono">{deleteOpen?.email}</span> will be free to register again as a new user.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Type the email to confirm</Label>
            <Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={deleteOpen?.email} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy || !deleteOpen || deleteConfirm.trim().toLowerCase() !== (deleteOpen?.email || '').toLowerCase()}
              onClick={async () => {
                if (!deleteOpen) return;
                setBusy(true);
                const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { user_id: deleteOpen.id } });
                setBusy(false);
                if (error || (data as any)?.error) {
                  toast({ title: 'Delete failed', description: (data as any)?.error || error?.message, variant: 'destructive' });
                  return;
                }
                toast({ title: 'User deleted' });
                setDeleteOpen(null);
                setDeleteConfirm('');
                await load();
              }}
            >
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

