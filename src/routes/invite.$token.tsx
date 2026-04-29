import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { STAFF_PERMISSIONS, type PermissionMap, type PermissionKey } from "@/lib/constants";

type Invite = {
  id: string; email: string; display_name: string | null; status: string;
  expires_at: string; permissions: PermissionMap; business_owner_id: string;
};

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Accept invite — SikaFlow" }] }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const { ready, user } = useRequireUser();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [ownerName, setOwnerName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    (async () => {
      if (!ready || !user) return;
      setLoading(true);
      const { data, error } = await supabase.from("staff_invites").select("*").eq("token", token).maybeSingle();
      if (error) { setError(error.message); setLoading(false); return; }
      if (!data) { setError("Invite not found or you're signed in with a different email."); setLoading(false); return; }
      const inv = data as Invite;
      if (inv.email.toLowerCase() !== (user.email || "").toLowerCase()) {
        setError(`This invite is for ${inv.email}. Sign in with that account to accept.`);
        setLoading(false); return;
      }
      if (inv.status !== "pending") { setError("This invite has already been used or revoked."); setLoading(false); return; }
      if (new Date(inv.expires_at) < new Date()) { setError("This invite has expired."); setLoading(false); return; }
      setInvite(inv);
      const { data: prof } = await supabase.from("profiles").select("business_name").eq("id", inv.business_owner_id).maybeSingle();
      setOwnerName(prof?.business_name || "the business");
      setLoading(false);
    })();
  }, [ready, user, token]);

  async function accept() {
    if (!invite || !user) return;
    setAccepting(true);
    const { error: rpcErr } = await supabase.rpc("accept_staff_invite", { _token: token });
    setAccepting(false);
    if (rpcErr) return toast.error(rpcErr.message);
    toast.success("Invite accepted! You're now part of the team.");
    navigate({ to: "/dashboard" });
  }

  if (!ready || loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex justify-center"><Logo /></div>

        {error ? (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h1 className="text-lg font-semibold">Can't accept this invite</h1>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button asChild variant="outline" className="mt-4"><Link to="/dashboard">Go to dashboard</Link></Button>
          </div>
        ) : invite ? (
          <div>
            <h1 className="text-center text-lg font-semibold">You've been invited</h1>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{ownerName}</span> invited you to join their team on SikaFlow.
            </p>
            <div className="mt-4 rounded-xl border border-border bg-background p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Your access</p>
              <ul className="mt-2 space-y-1 text-sm">
                {STAFF_PERMISSIONS.filter((p) => invite.permissions[p.key as PermissionKey]).map((p) => (
                  <li key={p.key} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />{p.label}</li>
                ))}
                {Object.values(invite.permissions || {}).every((v) => !v) && (
                  <li className="text-muted-foreground">No specific permissions set yet.</li>
                )}
              </ul>
            </div>
            <Button onClick={accept} disabled={accepting} className="mt-4 w-full">
              {accepting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Accept invitation
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
