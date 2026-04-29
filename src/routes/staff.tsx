import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { UserPlus, Copy, Check, X, Loader2, Mail, Trash2 } from "lucide-react";
import { PageHeader } from "./products";
import { STAFF_PERMISSIONS, type PermissionMap, type PermissionKey } from "@/lib/constants";
import { toast } from "sonner";

type Invite = {
  id: string; email: string; display_name: string | null; status: string;
  token: string; expires_at: string; created_at: string; permissions: PermissionMap;
};
type Member = {
  id: string; staff_user_id: string; email: string | null; display_name: string | null;
  permissions: PermissionMap; active: boolean; created_at: string;
};

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff — SikaFlow" }] }),
  component: StaffPage,
});

function defaultPerms(): PermissionMap {
  return { sales: true, customers: true };
}

function StaffPage() {
  const { ready, user } = useRequireUser();
  const [profile, setProfile] = useState<{ business_name: string | null; email: string | null } | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  // Invite form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<PermissionMap>(defaultPerms());
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [{ data: prof }, { data: inv }, { data: mem }] = await Promise.all([
      supabase.from("profiles").select("business_name,email").eq("id", user.id).maybeSingle(),
      supabase.from("staff_invites").select("*").eq("business_owner_id", user.id).order("created_at", { ascending: false }),
      supabase.from("staff_members").select("*").eq("business_owner_id", user.id).order("created_at", { ascending: false }),
    ]);
    setProfile(prof ?? null);
    setInvites((inv as Invite[]) ?? []);
    setMembers((mem as Member[]) ?? []);
  }, [user]);

  useEffect(() => { if (ready) loadAll(); }, [ready, loadAll]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("staff-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_invites", filter: `business_owner_id=eq.${user.id}` }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_members", filter: `business_owner_id=eq.${user.id}` }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadAll]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const trimmed = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return toast.error("Enter a valid email");
    if (trimmed === (profile?.email || "").toLowerCase()) return toast.error("You can't invite yourself");
    setSubmitting(true);
    const { error } = await supabase.from("staff_invites").insert({
      business_owner_id: user.id,
      email: trimmed,
      display_name: name.trim() || null,
      permissions: perms,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success("Invite created — share the link with your staff");
    setEmail(""); setName(""); setPerms(defaultPerms()); setOpen(false);
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase.from("staff_invites").update({ status: "revoked" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite revoked");
  }
  async function deleteInvite(id: string) {
    const { error } = await supabase.from("staff_invites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invite removed");
  }
  async function toggleMember(m: Member) {
    const { error } = await supabase.from("staff_members").update({ active: !m.active }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(!m.active ? "Staff activated" : "Staff deactivated");
  }
  async function removeMember(id: string) {
    if (!confirm("Remove this staff member from your business?")) return;
    const { error } = await supabase.from("staff_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Staff removed");
  }
  async function savePerms() {
    if (!editing) return;
    const { error } = await supabase.from("staff_members").update({ permissions: editing.permissions }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Permissions updated");
    setEditing(null);
  }

  function inviteLink(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }
  async function copyInvite(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  if (!ready) return <AppShell><PageLoader /></AppShell>;

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PageHeader title="Staff / Users" description="Invite teammates and control what they can access." />
          <Button onClick={() => setOpen(true)} className="shrink-0"><UserPlus className="mr-2 h-4 w-4" /> Invite staff</Button>
        </div>

        {/* Owner */}
        <div className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Owner</h3>
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-background p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {(profile?.business_name || profile?.email || "U").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{profile?.business_name || "You"}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email} · Full access</p>
            </div>
          </div>
        </div>

        {/* Active staff */}
        <div className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Team members</h3>
          {members.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No staff yet. Invite someone to get started.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.display_name || m.email || "Team member"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email} · {Object.keys(m.permissions || {}).filter((k) => m.permissions[k as PermissionKey]).length} permissions · {m.active ? "Active" : "Disabled"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(m)}>Permissions</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleMember(m)}>{m.active ? "Disable" : "Enable"}</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeMember(m.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Invites */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Invitations</h3>
          {invites.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No invitations sent yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {invites.map((i) => {
                const expired = new Date(i.expires_at) < new Date();
                const status = i.status === "pending" && expired ? "expired" : i.status;
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.email}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <Mail className="mr-1 inline h-3 w-3" />
                        {i.display_name ? `${i.display_name} · ` : ""}{status} · expires {new Date(i.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {i.status === "pending" && !expired && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => copyInvite(i.token)}><Copy className="mr-2 h-4 w-4" /> Copy link</Button>
                          <Button size="sm" variant="ghost" onClick={() => revokeInvite(i.id)}><X className="h-4 w-4" /></Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteInvite(i.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Invite dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Invite staff member</DialogTitle></DialogHeader>
          <form onSubmit={sendInvite} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="i-email">Email</Label>
              <Input id="i-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="i-name">Display name (optional)</Label>
              <Input id="i-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Permissions</Label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STAFF_PERMISSIONS.map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <Checkbox checked={!!perms[p.key]} onCheckedChange={(v) => setPerms({ ...perms, [p.key]: !!v })} />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit permissions dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Edit permissions</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{editing.display_name || editing.email}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {STAFF_PERMISSIONS.map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <Checkbox
                      checked={!!editing.permissions[p.key]}
                      onCheckedChange={(v) => setEditing({ ...editing, permissions: { ...editing.permissions, [p.key]: !!v } })}
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={savePerms}><Check className="mr-2 h-4 w-4" /> Save</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
