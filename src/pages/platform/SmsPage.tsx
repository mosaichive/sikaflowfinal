import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, MessageSquare, Send, Users, AlertTriangle } from 'lucide-react';
import { getFunctionErrorMessage } from '@/lib/function-errors';

const MIN_LEN = 1;
const MAX_LEN = 320;
const SOFT_MIN = 160;

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  business_name: string | null;
  phone: string | null;
};

function normalizeGh(raw: string): string {
  const p = String(raw || '').trim().replace(/[\s\-()]/g, '');
  if (!p) return '';
  if (p.startsWith('+')) return '+' + p.slice(1).replace(/\D/g, '');
  if (/^0\d{9}$/.test(p)) return '+233' + p.slice(1);
  if (/^\d{9,15}$/.test(p)) return '+' + p;
  return p;
}
const isValidE164 = (p: string) => /^\+\d{8,15}$/.test(p);

export default function SmsPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<'individual' | 'bulk'>('individual');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingUsers(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, business_name, phone')
        .not('phone', 'is', null)
        .order('business_name', { ascending: true });
      if (!mounted) return;
      if (error) {
        toast({ title: 'Could not load users', description: error.message, variant: 'destructive' });
      } else {
        setUsers((data ?? []) as UserRow[]);
      }
      setLoadingUsers(false);
    })();
    return () => { mounted = false; };
  }, [toast]);

  const validUsers = useMemo(() => {
    const seen = new Set<string>();
    const out: (UserRow & { normalized: string })[] = [];
    for (const u of users) {
      const norm = normalizeGh(String(u.phone ?? ''));
      if (!isValidE164(norm)) continue;
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push({ ...u, normalized: norm });
    }
    return out;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return validUsers.slice(0, 50);
    return validUsers
      .filter((u) =>
        (u.business_name ?? '').toLowerCase().includes(q) ||
        (u.display_name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        u.normalized.includes(q),
      )
      .slice(0, 50);
  }, [validUsers, search]);

  const selectedUser = validUsers.find((u) => u.id === selectedId);
  const charCount = message.length;
  const overLimit = charCount > MAX_LEN;
  const empty = message.trim().length < MIN_LEN;
  const bulkCount = validUsers.length;

  async function performSend() {
    setSending(true);
    try {
      const payload: Record<string, unknown> = { mode, message: message.trim() };
      if (mode === 'individual') {
        if (!selectedUser) {
          toast({ title: 'Select a recipient', variant: 'destructive' });
          setSending(false);
          return;
        }
        payload.user_id = selectedUser.id;
      }
      const { data, error } = await supabase.functions.invoke('admin-send-sms', { body: payload });
      if (error) {
        const msg = await getFunctionErrorMessage(error, 'Failed to send SMS');
        toast({ title: 'SMS send failed', description: msg, variant: 'destructive' });
        return;
      }
      const result = (data ?? {}) as { sent?: number; failed?: number; total?: number };
      toast({
        title: 'SMS dispatched',
        description: `${result.sent ?? 0} sent, ${result.failed ?? 0} failed (of ${result.total ?? 0}).`,
      });
      setMessage('');
    } catch (err) {
      toast({
        title: 'SMS send failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }

  function onSendClick() {
    if (empty) {
      toast({ title: 'Message cannot be empty', variant: 'destructive' });
      return;
    }
    if (overLimit) {
      toast({ title: `Message exceeds ${MAX_LEN} characters`, variant: 'destructive' });
      return;
    }
    if (mode === 'individual' && !selectedUser) {
      toast({ title: 'Select a recipient', variant: 'destructive' });
      return;
    }
    if (mode === 'bulk' && bulkCount === 0) {
      toast({ title: 'No valid recipients', variant: 'destructive' });
      return;
    }
    setConfirmOpen(true);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6" /> SMS
        </h1>
        <p className="text-sm text-muted-foreground">Send individual or bulk SMS to registered users with valid phone numbers.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'individual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('individual')}
            >
              Individual
            </Button>
            <Button
              type="button"
              variant={mode === 'bulk' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('bulk')}
            >
              <Users className="h-4 w-4 mr-1" /> Bulk
            </Button>
          </div>

          {mode === 'individual' ? (
            <div className="space-y-3">
              <Label htmlFor="sms-search">Search recipient</Label>
              <Input
                id="sms-search"
                placeholder="Search by business, name, email, or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="border border-border rounded-md max-h-64 overflow-auto divide-y divide-border">
                {loadingUsers ? (
                  <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No matching users.</div>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedId(u.id)}
                      className={`w-full text-left p-3 text-sm hover:bg-secondary transition-colors ${
                        selectedId === u.id ? 'bg-primary/10' : ''
                      }`}
                    >
                      <div className="font-medium text-foreground">
                        {u.business_name || u.display_name || u.email || 'Unnamed'}
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-2 flex-wrap">
                        <span>{u.normalized}</span>
                        {u.email && <span>· {u.email}</span>}
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selectedUser && (
                <div className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">{selectedUser.business_name || selectedUser.display_name || selectedUser.email}</span> ({selectedUser.normalized})
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  Bulk SMS will reach {bulkCount} recipient{bulkCount === 1 ? '' : 's'}.
                </p>
                <p className="text-xs text-muted-foreground">
                  Users without a valid phone are skipped. Duplicate numbers are deduplicated. Bulk SMS may use SMS credits.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="sms-message">Message</Label>
              <div className="text-xs">
                <Badge variant={overLimit ? 'destructive' : charCount >= SOFT_MIN ? 'default' : 'secondary'}>
                  {charCount} / {MAX_LEN}
                </Badge>
              </div>
            </div>
            <Textarea
              id="sms-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your SMS message…"
              rows={5}
              maxLength={MAX_LEN + 50}
            />
            <p className="text-xs text-muted-foreground">
              Recommended length: {SOFT_MIN}–{MAX_LEN} characters. Empty messages will be rejected.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={onSendClick} disabled={sending || empty || overLimit}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send {mode === 'bulk' ? `to ${bulkCount}` : ''}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === 'bulk' ? `Send bulk SMS to ${bulkCount} recipients?` : 'Send SMS?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === 'bulk'
                ? 'This will dispatch the message to every registered user with a valid phone number. Bulk SMS may use SMS credits and cannot be undone.'
                : `This will send the message to ${selectedUser?.normalized ?? 'the selected user'}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void performSend(); }} disabled={sending}>
              {sending ? 'Sending…' : 'Confirm send'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
