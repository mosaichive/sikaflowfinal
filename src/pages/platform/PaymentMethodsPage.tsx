import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Building2, Pencil, Plus, Smartphone, Trash2 } from 'lucide-react';

type Kind = 'momo' | 'bank';
type Method = {
  id: string;
  type: Kind | string;
  label: string;
  details: Record<string, any>;
  active: boolean;
  sort_order: number;
};

const KIND_META: Record<Kind, { title: string; icon: typeof Smartphone; desc: string }> = {
  momo: { title: 'Mobile Money', icon: Smartphone, desc: 'Manual MoMo payment instructions for tenants.' },
  bank: { title: 'Bank Transfer', icon: Building2, desc: 'Manual bank transfer instructions.' },
};

const FIELDS: Record<Kind, { key: string; label: string; placeholder?: string }[]> = {
  momo: [
    { key: 'network', label: 'Network', placeholder: 'MTN / Telecel / AirtelTigo' },
    { key: 'account_name', label: 'Account name' },
    { key: 'number', label: 'MoMo number', placeholder: '024xxxxxxx' },
  ],
  bank: [
    { key: 'bank_name', label: 'Bank name' },
    { key: 'account_name', label: 'Account name' },
    { key: 'account_number', label: 'Account number' },
    { key: 'branch', label: 'Branch' },
  ],
};

const empty = (kind: Kind): Partial<Method> => ({
  type: kind, label: '', details: {}, active: true, sort_order: 0,
});

export default function PaymentMethodsPage() {
  const { toast } = useToast();
  const [methods, setMethods] = useState<Method[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Method> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .order('type')
      .order('sort_order');
    if (error) toast({ title: 'Failed to load', description: error.message, variant: 'destructive' });
    setMethods((data as Method[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
    const ch = supabase.channel('platform-pm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_methods' }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.label?.trim()) {
      toast({ title: 'Label required', variant: 'destructive' });
      return;
    }
    setBusy(true);
    const payload = {
      type: editing.type as string,
      label: editing.label.trim(),
      details: {
        ...(editing.details ?? {}),
        instructions: (editing.details as any)?.instructions ?? '',
        badge: (editing.details as any)?.badge ?? '',
      },
      active: editing.active ?? true,
      sort_order: Number(editing.sort_order ?? 0),
    };
    const { error } = editing.id
      ? await supabase.from('payment_methods').update(payload).eq('id', editing.id)
      : await supabase.from('payment_methods').insert(payload);
    setBusy(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editing.id ? 'Updated' : 'Created' });
    setEditing(null);
    await load();
  };

  const toggle = async (m: Method) => {
    const { error } = await supabase.from('payment_methods').update({ active: !m.active }).eq('id', m.id);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    await load();
  };

  const remove = async (m: Method) => {
    if (!confirm(`Delete "${m.label}"?`)) return;
    const { error } = await supabase.from('payment_methods').delete().eq('id', m.id);
    if (error) return toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Deleted' });
    await load();
  };

  const grouped: Record<Kind, Method[]> = { momo: [], bank: [] };
  methods.forEach((m) => { if (m.type === 'momo' || m.type === 'bank') grouped[m.type as Kind].push(m); });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Platform Payment Methods</h1>
        <p className="text-sm text-muted-foreground">Configure subscription payment options for tenants.</p>
      </div>

      {(['momo', 'bank'] as Kind[]).map((kind) => {
        const meta = KIND_META[kind];
        const Icon = meta.icon;
        return (
          <Card key={kind}>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base">{meta.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{meta.desc}</p>
                </div>
              </div>
              <Button size="sm" onClick={() => setEditing(empty(kind))}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? <p className="text-xs text-muted-foreground">Loading…</p> : grouped[kind].length === 0 ? (
                <p className="text-xs text-muted-foreground">No {meta.title.toLowerCase()} configured yet.</p>
              ) : (
                <div className="space-y-2">
                  {grouped[kind].map((m) => (
                    <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">{m.label}</p>
                          {(m.details as any)?.badge && <Badge variant="outline" className="text-[10px]">{(m.details as any).badge}</Badge>}
                          {!m.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground space-x-2">
                          {Object.entries(m.details || {}).filter(([k, v]) => v && k !== 'instructions' && k !== 'badge').map(([k, v]) => (
                            <span key={k}><span className="opacity-60">{k}:</span> <span className="font-mono">{String(v)}</span></span>
                          ))}
                        </div>
                        {(m.details as any)?.instructions && <p className="mt-1 text-[11px] text-muted-foreground">{(m.details as any).instructions}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={m.active} onCheckedChange={() => toggle(m)} />
                        <Button size="sm" variant="ghost" onClick={() => setEditing(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(m)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Edit' : 'Add'} {editing && (editing.type === 'momo' || editing.type === 'bank') ? KIND_META[editing.type as Kind].title : 'Method'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Display label *</Label>
                <Input value={editing.label ?? ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {FIELDS[editing.type as Kind]?.map((field) => (
                  <div key={field.key}>
                    <Label className="text-xs">{field.label}</Label>
                    <Input
                      value={(editing.details as any)?.[field.key] ?? ''}
                      placeholder={field.placeholder}
                      onChange={(e) => setEditing({ ...editing, details: { ...(editing.details ?? {}), [field.key]: e.target.value } })}
                    />
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-xs">Badge</Label>
                <Input value={(editing.details as any)?.badge ?? ''} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details ?? {}), badge: e.target.value } })} placeholder="Preferred" />
              </div>
              <div>
                <Label className="text-xs">Instructions</Label>
                <Textarea rows={3} value={(editing.details as any)?.instructions ?? ''} onChange={(e) => setEditing({ ...editing, details: { ...(editing.details ?? {}), instructions: e.target.value } })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
