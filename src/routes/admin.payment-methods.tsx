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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/payment-methods")({
  head: () => ({ meta: [{ title: "Payment Methods — Admin" }] }),
  component: PaymentMethodsPage,
});

type Method = {
  id: string;
  type: "bank" | "momo" | "note";
  label: string;
  details: Record<string, string>;
  active: boolean;
  sort_order: number;
};

function PaymentMethodsPage() {
  const { ready } = useRequireAdmin();
  const [items, setItems] = useState<Method[]>([]);
  const [editing, setEditing] = useState<Partial<Method> | null>(null);

  async function load() {
    const { data } = await supabase.from("payment_methods").select("*").order("sort_order").order("created_at");
    setItems((data as Method[]) ?? []);
  }
  useEffect(() => { if (ready) load(); }, [ready]);

  async function remove(id: string) {
    if (!confirm("Delete this payment method?")) return;
    const { error } = await supabase.from("payment_methods").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  async function toggleActive(m: Method) {
    await supabase.from("payment_methods").update({ active: !m.active }).eq("id", m.id);
    load();
  }

  if (!ready) return <PageLoader />;

  return (
    <AdminShell>
      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Payment Methods</h1>
            <p className="mt-1 text-sm text-muted-foreground">Configure what users see when paying for a subscription.</p>
          </div>
          <Button onClick={() => setEditing({ type: "bank", label: "", details: {}, active: true, sort_order: items.length })}>
            <Plus className="mr-1 h-4 w-4" /> Add method
          </Button>
        </div>

        <div className="grid gap-3">
          {items.map((m) => (
            <Card key={m.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary">{m.type}</span>
                  <h3 className="font-semibold">{m.label}</h3>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  {Object.entries(m.details || {}).map(([k, v]) => (
                    <div key={k}><span className="font-medium text-foreground/70">{k}:</span> {v}</div>
                  ))}
                </dl>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch checked={m.active} onCheckedChange={() => toggleActive(m)} />
                  <span className="text-xs text-muted-foreground">{m.active ? "Active" : "Hidden"}</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(m.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
              </div>
            </Card>
          ))}
          {items.length === 0 && (
            <Card className="p-10 text-center text-sm text-muted-foreground">No payment methods yet. Add one to get started.</Card>
          )}
        </div>
      </div>

      <MethodDialog method={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </AdminShell>
  );
}

function MethodDialog({ method, onClose, onSaved }: { method: Partial<Method> | null; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<"bank" | "momo" | "note">("bank");
  const [label, setLabel] = useState("");
  const [active, setActive] = useState(true);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (method) {
      setType((method.type as any) ?? "bank");
      setLabel(method.label ?? "");
      setActive(method.active ?? true);
      setDetails((method.details as any) ?? {});
    }
  }, [method]);

  async function save() {
    if (!label.trim()) return toast.error("Label is required");
    setSaving(true);
    const payload: any = { type, label: label.trim(), active, details };
    const { error } = method?.id
      ? await supabase.from("payment_methods").update(payload).eq("id", method.id)
      : await supabase.from("payment_methods").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  }

  return (
    <Dialog open={!!method} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{method?.id ? "Edit" : "Add"} payment method</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="momo">Mobile Money</SelectItem>
                <SelectItem value="note">Custom note</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={type === "bank" ? "GCB Bank — Business account" : type === "momo" ? "MTN MoMo" : "Payment instructions"} />
          </div>
          {type === "bank" && (
            <div className="grid grid-cols-2 gap-2">
              <FieldInput label="Bank name" v={details.bank_name} on={(v) => setDetails({ ...details, bank_name: v })} />
              <FieldInput label="Account name" v={details.account_name} on={(v) => setDetails({ ...details, account_name: v })} />
              <FieldInput label="Account #" v={details.account_number} on={(v) => setDetails({ ...details, account_number: v })} />
              <FieldInput label="Branch" v={details.branch} on={(v) => setDetails({ ...details, branch: v })} />
            </div>
          )}
          {type === "momo" && (
            <div className="grid grid-cols-2 gap-2">
              <FieldInput label="Provider" v={details.provider} on={(v) => setDetails({ ...details, provider: v })} />
              <FieldInput label="Number" v={details.number} on={(v) => setDetails({ ...details, number: v })} />
              <FieldInput label="Account name" v={details.account_name} on={(v) => setDetails({ ...details, account_name: v })} />
            </div>
          )}
          {type === "note" && (
            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea rows={4} value={details.note ?? ""} onChange={(e) => setDetails({ note: e.target.value })} placeholder="Send proof to support@sikaflow.com after payment..." />
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <Label>Visible to users</Label>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldInput({ label, v, on }: { label: string; v?: string; on: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={v ?? ""} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
