import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Wifi, Activity, Moon, AlarmClock, RefreshCw } from 'lucide-react';

interface ActivityRow {
  id: string;
  email: string | null;
  display_name: string | null;
  business_name: string | null;
  phone: string | null;
  role: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  suspended: boolean | null;
  created_at: string | null;
  last_login_at: string | null;
  last_activity_at: string | null;
  login_count: number | null;
}

type DerivedStatus = 'online' | 'active' | 'inactive' | 'dormant' | 'never';

const STATUS_LABEL: Record<DerivedStatus, string> = {
  online: 'Online',
  active: 'Active',
  inactive: 'Inactive',
  dormant: 'Dormant',
  never: 'Never signed in',
};

const STATUS_TONE: Record<DerivedStatus, string> = {
  online: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  active: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  inactive: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  dormant: 'bg-red-500/15 text-red-600 border-red-500/30',
  never: 'bg-muted text-muted-foreground border-border',
};

function deriveStatus(lastActivity: string | null): DerivedStatus {
  if (!lastActivity) return 'never';
  const ageMs = Date.now() - new Date(lastActivity).getTime();
  const minutes = ageMs / 60000;
  const days = ageMs / 86_400_000;
  if (minutes <= 5) return 'online';
  if (days <= 30) return 'active';
  if (days <= 90) return 'inactive';
  return 'dormant';
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString();
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export default function UserActivityPage() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [businessFilter, setBusinessFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selected, setSelected] = useState<ActivityRow | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await (supabase as any).rpc('admin_user_activity');
    if (err) {
      setError(err.message || 'Failed to load activity');
      setRows([]);
    } else {
      setRows((data as ActivityRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Re-derive "online" status every 30s without refetching.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const enriched = useMemo(() => rows.map((r) => ({ ...r, status: deriveStatus(r.last_activity_at) })), [rows]);

  const businesses = useMemo(() => {
    const set = new Set<string>();
    enriched.forEach((r) => { if (r.business_name) set.add(r.business_name); });
    return Array.from(set).sort();
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86_399_000 : null;
    return enriched.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (planFilter !== 'all' && (r.subscription_plan ?? '') !== planFilter) return false;
      if (businessFilter !== 'all' && (r.business_name ?? '') !== businessFilter) return false;
      if (q) {
        const hay = [r.display_name, r.email, r.phone, r.business_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fromTs || toTs) {
        const t = r.last_activity_at ? new Date(r.last_activity_at).getTime() : null;
        if (!t) return false;
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      return true;
    });
  }, [enriched, search, statusFilter, planFilter, businessFilter, dateFrom, dateTo]);

  const summary = useMemo(() => {
    const s = { total: enriched.length, online: 0, active: 0, inactive: 0, dormant: 0 };
    enriched.forEach((r) => {
      if (r.status === 'online') s.online++;
      else if (r.status === 'active') s.active++;
      else if (r.status === 'inactive') s.inactive++;
      else if (r.status === 'dormant') s.dormant++;
    });
    return s;
  }, [enriched]);

  const cards = [
    { label: 'Total Users', value: summary.total, icon: Users, tone: 'text-foreground' },
    { label: 'Online Now', value: summary.online, icon: Wifi, tone: 'text-emerald-500' },
    { label: 'Active (30d)', value: summary.active, icon: Activity, tone: 'text-blue-500' },
    { label: 'Inactive (>30d)', value: summary.inactive, icon: Moon, tone: 'text-amber-500' },
    { label: 'Dormant (>90d)', value: summary.dormant, icon: AlarmClock, tone: 'text-red-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Activity</h1>
          <p className="text-sm text-muted-foreground">Read-only monitoring of platform-wide sign-ins and activity.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <c.icon className={`h-3.5 w-3.5 ${c.tone}`} /> {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <Input
            placeholder="Search name, email, phone, business"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:col-span-2"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="dormant">Dormant</SelectItem>
              <SelectItem value="never">Never signed in</SelectItem>
            </SelectContent>
          </Select>
          <Select value={planFilter} onValueChange={setPlanFilter}>
            <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
              <SelectItem value="lifetime">Lifetime</SelectItem>
            </SelectContent>
          </Select>
          <Select value={businessFilter} onValueChange={setBusinessFilter}>
            <SelectTrigger><SelectValue placeholder="Business" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All businesses</SelectItem>
              {businesses.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Activity from" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Activity to" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : loading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading activity…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No users match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                      <TableCell className="font-medium">{r.display_name || '—'}</TableCell>
                      <TableCell>{r.business_name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{r.email || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{r.phone || '—'}</TableCell>
                      <TableCell className="capitalize">{r.role || '—'}</TableCell>
                      <TableCell className="capitalize">{r.subscription_plan || '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{timeAgo(r.last_login_at)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{timeAgo(r.last_activity_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.display_name || selected?.email || 'User details'}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <Row label="Email" value={selected.email || '—'} />
              <Row label="Phone" value={selected.phone || '—'} />
              <Row label="Business" value={selected.business_name || '—'} />
              <Row label="Role" value={selected.role || '—'} />
              <Row label="Plan" value={selected.subscription_plan || '—'} />
              <Row label="Subscription status" value={selected.subscription_status || '—'} />
              <Row label="Account created" value={formatDate(selected.created_at)} />
              <Row label="Last login" value={formatDate(selected.last_login_at)} />
              <Row label="Last activity" value={formatDate(selected.last_activity_at)} />
              <Row label="Login count" value={String(selected.login_count ?? 0)} />
              <Row label="Current status" value={STATUS_LABEL[deriveStatus(selected.last_activity_at)]} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  );
}
