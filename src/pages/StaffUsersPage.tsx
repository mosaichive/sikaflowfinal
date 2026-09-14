import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { EmptyState } from '@/components/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Trash2, UserPlus, Users, Copy, Power, Settings2, Mail, RefreshCw } from 'lucide-react';
import { PermissionsEditor } from '@/components/PermissionsEditor';
import { getFunctionErrorMessage } from '@/lib/function-errors';
import { TEAM_ROLES, modulesForRole, type ModuleKey } from '@/lib/permissions';
import { notifyTeamInvite, isPhoneSendable } from '@/lib/sms-notifications';
import { normalizeGhanaPhone } from '@/lib/phone-otp';

type MemberRow = {
  id: string;
  staff_user_id: string | null;
  display_name: string | null;
  email: string | null;
  active: boolean;
  permissions: { role?: string; modules?: ModuleKey[] };
};

type InviteRow = {
  id: string;
  email: string;
  display_name: string | null;
  token: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  permissions: { role?: string; modules?: ModuleKey[] };
};

export default function StaffUsersPage() {
  const { user, isAdmin, isStaffMember, hasModule, effectiveBusinessOwnerId, displayName } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const defaultRole = 'salesperson';
  const [form, setForm] = useState<{ email: string; full_name: string; phone: string; role: string; modules: ModuleKey[]; mode: 'link' | 'email' | 'password'; password: string }>(
    { email: '', full_name: '', phone: '', role: defaultRole, modules: modulesForRole(defaultRole), mode: 'link', password: '' },
  );
  const canManageTeam = isStaffMember ? hasModule('staff') : isAdmin;
  const isBusinessOwner = Boolean(user?.id && user.id === effectiveBusinessOwnerId);

  const load = useCallback(async () => {
    if (!user?.id || !effectiveBusinessOwnerId) return;
    const [m, i] = await Promise.all([
      (supabase as any).from('staff_members').select('id, staff_user_id, display_name, email, active, permissions').eq('business_owner_id', effectiveBusinessOwnerId).is('removed_at', null).order('created_at', { ascending: false }),
      (supabase as any).from('staff_invites').select('id, email, display_name, token, status, expires_at, accepted_at, permissions').eq('business_owner_id', effectiveBusinessOwnerId).order('created_at', { ascending: false }),
    ]);
    if (m.error || i.error) {
      toast({
        title: 'Could not load team',
        description: m.error?.message || i.error?.message,
        variant: 'destructive',
      });
      return;
    }
    setMembers((m.data || []) as MemberRow[]);
    setInvites((i.data || []) as InviteRow[]);
  }, [effectiveBusinessOwnerId, toast, user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!effectiveBusinessOwnerId) return;
    const ch = supabase
      .channel(`team-${effectiveBusinessOwnerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_members', filter: `business_owner_id=eq.${effectiveBusinessOwnerId}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_invites', filter: `business_owner_id=eq.${effectiveBusinessOwnerId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [effectiveBusinessOwnerId, load]);

  const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      toast({ title: 'Invite link copied', description: 'Share it with your team member.' });
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const sendEmail = (row: InviteRow) => {
    const subject = encodeURIComponent(`You're invited to join ${displayName || 'our team'} on KudiTrack`);
    const body = encodeURIComponent(`Hi${row.display_name ? ' ' + row.display_name : ''},\n\nYou've been invited to join as ${row.permissions?.role || 'staff'}.\n\nAccept here: ${inviteLink(row.token)}\n\nThis link expires on ${new Date(row.expires_at).toLocaleDateString()}.`);
    window.location.href = `mailto:${row.email}?subject=${subject}&body=${body}`;
  };

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    setSubmitting(true);
    try {
      const email = form.email.trim().toLowerCase();
      if (!email) throw new Error('Email is required');
      const phone = form.phone.trim();
      const normalizedPhone = phone && isPhoneSendable(phone) ? normalizeGhanaPhone(phone) : null;
      if (phone && !normalizedPhone) throw new Error('Enter a valid phone number');

      if (form.mode === 'password') {
        const fullName = form.full_name.trim();
        if (!fullName) throw new Error('Full name is required for password invite');
        if (!form.password || form.password.length < 12) throw new Error('Temporary password must be at least 12 characters');

        const { data, error } = await supabase.functions.invoke('manage-business-user', {
          body: {
            action: 'invite',
            mode: 'password',
            email,
            full_name: fullName,
            phone: normalizedPhone,
            role: form.role,
            modules: form.modules,
            password: form.password,
          },
        });
        if (error) throw new Error(await getFunctionErrorMessage(error, 'Failed to create team member'));
        if ((data as any)?.error) throw new Error((data as any).error);
        toast({
          title: 'Team member created',
          description: `${fullName} can now log in with the temporary password you set.`,
        });
      } else {
        const { data, error } = await supabase.functions.invoke('manage-business-user', {
          body: {
            action: 'invite',
            mode: form.mode,
            email,
            full_name: form.full_name.trim() || null,
            phone: normalizedPhone,
            role: form.role,
            modules: form.modules,
          },
        });
        if (error) throw new Error(await getFunctionErrorMessage(error, 'Failed to create invitation'));
        if ((data as any)?.error) throw new Error((data as any).error);
        const inviteId = String((data as any)?.invite_id || '');
        const inviteToken = String((data as any)?.token || '');
        if (!inviteId || !inviteToken) throw new Error('The invitation was not confirmed by the server');

        if (form.mode === 'link') {
          await copyLink(inviteToken);
        } else {
          const delivery = String((data as any)?.email_delivery || 'failed');
          if (delivery === 'sent') {
            toast({ title: 'Invitation email sent', description: 'The link expires in 7 days.' });
          } else {
            await navigator.clipboard.writeText(inviteLink(inviteToken)).catch(() => undefined);
            toast({
              title: 'Invite link created',
              description: delivery === 'existing_account'
                ? 'This person already has an account. Send them the copied invite link.'
                : 'Email delivery was unavailable, so the invite link was copied instead.',
            });
          }
        }

        if (normalizedPhone) void notifyTeamInvite(inviteId, toast);
      }

      setForm({ email: '', full_name: '', phone: '', role: defaultRole, modules: modulesForRole(defaultRole), mode: 'link', password: '' });
      setInviteOpen(false);
      void load();
    } catch (err) {
      toast({ title: 'Could not create invite', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const revokeInvite = async (id: string) => {
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke('manage-business-user', {
      body: { action: 'revoke_invite', invite_id: id },
    });
    setBusyId(null);
    if (error || (data as any)?.error) toast({ title: 'Could not revoke', description: (data as any)?.error || await getFunctionErrorMessage(error), variant: 'destructive' });
    else { toast({ title: 'Invite revoked' }); void load(); }
  };

  const resendInvite = async (row: InviteRow) => {
    setBusyId(row.id);
    const { data, error } = await supabase.functions.invoke('manage-business-user', {
      body: { action: 'refresh_invite', invite_id: row.id },
    });
    setBusyId(null);
    if (error || (data as any)?.error) toast({ title: 'Could not refresh', description: (data as any)?.error || await getFunctionErrorMessage(error), variant: 'destructive' });
    else {
      toast({ title: 'Invite refreshed', description: 'A new link was copied and expires in 7 days.' });
      void copyLink(String((data as any)?.token || row.token));
      void load();
    }
  };

  const toggleActive = async (m: MemberRow) => {
    setBusyId(m.id);
    try {
      const { data, error } = await supabase.functions.invoke('manage-business-user', {
        body: {
          action: 'update',
          member_id: m.id,
          full_name: m.display_name,
          role: m.permissions?.role || defaultRole,
          modules: m.permissions?.modules || [],
          active: !m.active,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || await getFunctionErrorMessage(error));
      toast({ title: m.active ? 'Member suspended' : 'Member reactivated' });
      void load();
    } catch (error) {
      toast({ title: 'Could not update', description: await getFunctionErrorMessage(error), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (m: MemberRow) => {
    if (!confirm(`Remove ${m.display_name || m.email} from your team?`)) return;
    setBusyId(m.id);
    try {
      const { data, error } = await supabase.functions.invoke('manage-business-user', {
        body: { action: 'remove', member_id: m.id },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || await getFunctionErrorMessage(error));
      toast({ title: 'Member removed', description: 'Their account and business history were preserved.' });
      void load();
    } catch (error) {
      toast({ title: 'Could not remove', description: await getFunctionErrorMessage(error), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (m: MemberRow) => {
    setBusyId(m.id);
    try {
      const { data, error } = await supabase.functions.invoke('manage-business-user', {
        body: {
          action: 'update',
          member_id: m.id,
          full_name: m.display_name,
          role: m.permissions?.role || defaultRole,
          modules: m.permissions?.modules || [],
          active: m.active,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || await getFunctionErrorMessage(error));
      toast({ title: 'Permissions updated' });
      setEditing(null);
      void load();
    } catch (error) {
      toast({ title: 'Could not save', description: await getFunctionErrorMessage(error), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const now = Date.now();
  const pending = useMemo(() => invites.filter((i) => i.status === 'pending' && new Date(i.expires_at).getTime() > now), [invites, now]);
  const expired = useMemo(() => invites.filter((i) => i.status === 'expired' || (i.status === 'pending' && new Date(i.expires_at).getTime() <= now)), [invites, now]);
  const accepted = useMemo(() => invites.filter((i) => i.status === 'accepted'), [invites]);

  return (
    <AppLayout title="Team Management">
      <div className="space-y-6">
        <section className="flex flex-col gap-4 rounded-3xl border border-border/70 bg-card/75 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Team Management</h1>
            <p className="text-sm text-muted-foreground">
              Invite teammates by link, assign roles, and pick exactly which modules they can access.
            </p>
          </div>
          {canManageTeam && (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button><UserPlus className="mr-2 h-4 w-4" /> Invite Team Member</Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
                <form className="space-y-4" onSubmit={createInvite}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Full name (optional)</Label>
                      <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone (optional, for SMS invite)</Label>
                    <Input
                      type="tel"
                      placeholder="e.g. 0244123456 or +233244123456"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {form.mode === 'password'
                        ? 'Saved as their contact number.'
                        : "If provided, we'll text the invite link to this number too."}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v, modules: modulesForRole(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TEAM_ROLES.filter((r) => isBusinessOwner || r.value !== 'admin').map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Invite method</Label>
                    <Select value={form.mode} onValueChange={(v: 'link' | 'email' | 'password') => setForm((f) => ({ ...f, mode: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="link">Send invite link (they set their own password)</SelectItem>
                        <SelectItem value="email">Send invitation email</SelectItem>
                        <SelectItem value="password">Create account with a temporary password</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {form.mode === 'password'
                        ? 'They can log in immediately with this password and should change it on first sign-in.'
                        : form.mode === 'email'
                          ? 'We will email a secure invite. Existing KudiTrack users can use the generated link.'
                          : 'Share the generated link. They will accept the invite and create their own password.'}
                    </p>
                  </div>
                  {form.mode === 'password' ? (
                    <div className="space-y-2">
                      <Label>Temporary password</Label>
                      <PasswordInput
                        minLength={12}
                        required
                        value={form.password}
                        onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                        placeholder="At least 12 characters"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label>Module access</Label>
                    <PermissionsEditor value={form.modules} onChange={(modules) => setForm((f) => ({ ...f, modules }))} />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? 'Creating...' : form.mode === 'password' ? 'Create team member' : form.mode === 'email' ? 'Send invitation email' : 'Create invite link'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </section>

        <Tabs defaultValue="members">
          <TabsList>
            <TabsTrigger value="members">Members ({members.length})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="accepted">Accepted ({accepted.length})</TabsTrigger>
            <TabsTrigger value="expired">Expired ({expired.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="members">
            <Card className="border-border/70">
              <CardContent className="p-0">
                {members.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Modules</TableHead>
                          <TableHead>Status</TableHead>
                          {canManageTeam && <TableHead className="text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-primary" />
                                <span className="font-medium">{m.display_name || '—'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{m.email || '—'}</TableCell>
                            <TableCell><Badge variant="secondary" className="capitalize">{m.permissions?.role || 'staff'}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{(m.permissions?.modules || []).length} module(s)</TableCell>
                            <TableCell>
                              <Badge variant={m.active ? 'default' : 'outline'}>{m.active ? 'Active' : 'Suspended'}</Badge>
                            </TableCell>
                            {canManageTeam && (
                              <TableCell className="text-right">
                                {(isBusinessOwner || m.permissions?.role !== 'admin') && (
                                  <>
                                    <Button variant="ghost" size="icon" aria-label="Edit member" title="Edit member" onClick={() => setEditing({ ...m, permissions: { role: m.permissions?.role || 'staff', modules: m.permissions?.modules || [] } })}>
                                      <Settings2 className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" aria-label={m.active ? 'Suspend member' : 'Reactivate member'} title={m.active ? 'Suspend member' : 'Reactivate member'} disabled={busyId === m.id} onClick={() => void toggleActive(m)}>
                                      <Power className={`h-4 w-4 ${m.active ? 'text-amber-500' : 'text-emerald-500'}`} />
                                    </Button>
                                    <Button variant="ghost" size="icon" aria-label="Remove member" title="Remove member" className="text-destructive" disabled={busyId === m.id} onClick={() => void removeMember(m)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <EmptyState
                    icon={<Users className="h-7 w-7 text-muted-foreground" />}
                    title="No team members yet"
                    description="Invite your first teammate to start collaborating."
                    action={canManageTeam ? <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> Invite Team Member</Button> : undefined}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {[
            { key: 'pending', list: pending, empty: 'No pending invites.' },
            { key: 'accepted', list: accepted, empty: 'No accepted invites yet.' },
            { key: 'expired', list: expired, empty: 'No expired invites.' },
          ].map((tab) => (
            <TabsContent value={tab.key} key={tab.key}>
              <Card className="border-border/70">
                <CardContent className="p-0">
                  {tab.list.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>{tab.key === 'accepted' ? 'Accepted' : 'Expires'}</TableHead>
                            {canManageTeam && <TableHead className="text-right">Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tab.list.map((inv) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-medium">{inv.email}</TableCell>
                              <TableCell><Badge variant="secondary" className="capitalize">{inv.permissions?.role || 'staff'}</Badge></TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(tab.key === 'accepted' ? (inv.accepted_at || inv.expires_at) : inv.expires_at).toLocaleString()}
                              </TableCell>
                              {canManageTeam && (
                                <TableCell className="text-right">
                                  {tab.key === 'pending' && (
                                    <>
                                      <Button variant="ghost" size="icon" onClick={() => void copyLink(inv.token)}><Copy className="h-4 w-4" /></Button>
                                      <Button variant="ghost" size="icon" onClick={() => sendEmail(inv)}><Mail className="h-4 w-4" /></Button>
                                    </>
                                  )}
                                  {tab.key === 'expired' && (
                                    <Button variant="ghost" size="icon" disabled={busyId === inv.id} onClick={() => void resendInvite(inv)}><RefreshCw className="h-4 w-4" /></Button>
                                  )}
                                  {tab.key !== 'accepted' && (
                                    <Button variant="ghost" size="icon" className="text-destructive" disabled={busyId === inv.id} onClick={() => void revokeInvite(inv.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-10 text-center text-sm text-muted-foreground">{tab.empty}</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Edit permissions</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={editing.display_name || ''} onChange={(e) => setEditing({ ...editing, display_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={editing.permissions?.role || 'staff'}
                  onValueChange={(v) => setEditing({ ...editing, permissions: { ...editing.permissions, role: v, modules: modulesForRole(v) } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEAM_ROLES.filter((r) => isBusinessOwner || r.value !== 'admin').map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Module access</Label>
                <PermissionsEditor
                  value={(editing.permissions?.modules || []) as ModuleKey[]}
                  onChange={(modules) => setEditing({ ...editing, permissions: { ...editing.permissions, modules } })}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button disabled={busyId === editing.id} onClick={() => void saveEdit(editing)}>Save</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
