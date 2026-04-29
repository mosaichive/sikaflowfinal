import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { useRequireAdmin } from "@/lib/use-require-admin";
import { PageLoader } from "@/lib/use-require-user";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, Megaphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/announcements")({
  head: () => ({ meta: [{ title: "Announcements — Admin" }] }),
  component: AdminAnnouncementsPage,
});

type Announcement = {
  id: string;
  title: string;
  message: string;
  audience: string;
  priority: string;
  publish_at: string;
  target_user_id: string | null;
  target_plan: string | null;
  created_at: string;
};

function AdminAnnouncementsPage() {
  const { ready } = useRequireAdmin();
  const { user } = useAuth();
  const [items, setItems] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [target, setTarget] = useState<"all" | "plan" | "user">("all");
  const [plan, setPlan] = useState("monthly");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setItems((data as Announcement[]) ?? []);
  }
  useEffect(() => { if (ready) load(); }, [ready]);

  async function create() {
    if (!title.trim() || !message.trim()) return toast.error("Title and message are required");
    setSaving(true);
    let target_user_id: string | null = null;
    let target_plan: string | null = null;
    let audience = "all";
    if (target === "user") {
      const { data: prof } = await supabase.from("profiles").select("id").eq("email", email.trim()).maybeSingle();
      if (!prof) { setSaving(false); return toast.error("No user with that email"); }
      target_user_id = prof.id;
    } else if (target === "plan") {
      target_plan = plan;
    }
    const { error } = await supabase.from("announcements").insert({
      title: title.trim(), message: message.trim(), audience, priority,
      target_user_id, target_plan, created_by: user?.id, publish_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Announcement published");
    setOpen(false);
    setTitle(""); setMessage(""); setPriority("normal"); setTarget("all"); setEmail("");
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this announcement?")) return;
    await supabase.from("announcements").delete().eq("id", id);
    load();
  }

  if (!ready) return <PageLoader />;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
            <p className="mt-1 text-sm text-muted-foreground">Send platform-wide or targeted messages to users.</p>
          </div>
          <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New</Button>
        </div>

        <div className="grid gap-3">
          {items.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Megaphone className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">{a.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      a.priority === "urgent" ? "bg-rose-500/10 text-rose-500"
                      : a.priority === "high" ? "bg-amber-500/10 text-amber-500"
                      : "bg-primary/10 text-primary"
                    }`}>{a.priority}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {a.target_user_id ? "Single user" : a.target_plan ? `${a.target_plan} plan` : "All users"}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
              </div>
            </Card>
          ))}
          {items.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground">No announcements yet.</Card>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New announcement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-2"><Label>Message</Label><Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={target} onValueChange={(v) => setTarget(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    <SelectItem value="plan">By plan</SelectItem>
                    <SelectItem value="user">Specific user</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {target === "plan" && (
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={plan} onValueChange={setPlan}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {target === "user" && (
              <div className="space-y-2">
                <Label>User email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@example.com" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving}>{saving ? "Publishing..." : "Publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
