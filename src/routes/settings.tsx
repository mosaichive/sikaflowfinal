import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/nav/AppShell";
import { useRequireUser, PageLoader } from "@/lib/use-require-user";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogOut, Sparkles, AlertTriangle, Upload, Loader2, ImageIcon } from "lucide-react";
import { trialDaysLeft, isTrialActive } from "@/lib/trial";
import { toast } from "sonner";
import { PageHeader } from "./products";
import { CURRENCIES } from "@/lib/constants";

type Profile = {
  business_name: string | null; phone: string | null; email: string | null;
  business_type: string | null; num_employees: string | null; location: string | null;
  role: string | null; trial_end_date: string; currency: string; logo_url: string | null;
  avatar_url: string | null;
};

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — SikaFlow" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { ready, user } = useRequireUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Email & password forms
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("profiles")
      .select("business_name,phone,email,business_type,num_employees,location,role,trial_end_date,currency,logo_url")
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => setProfile(data as Profile));
  }, [ready, user]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      business_name: profile.business_name?.trim() || null,
      phone: profile.phone?.trim() || null,
      business_type: profile.business_type?.trim() || null,
      num_employees: profile.num_employees?.trim() || null,
      location: profile.location?.trim() || null,
      role: profile.role?.trim() || null,
      currency: profile.currency,
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
  }

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2MB");
    if (!file.type.startsWith("image/")) return toast.error("Please pick an image file");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("business-logos").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("business-logos").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase.from("profiles").update({ logo_url: url }).eq("id", user.id);
      if (updErr) throw updErr;
      setProfile({ ...profile, logo_url: url });
      toast.success("Logo updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    if (!user || !profile) return;
    const { error } = await supabase.from("profiles").update({ logo_url: null }).eq("id", user.id);
    if (error) return toast.error(error.message);
    setProfile({ ...profile, logo_url: null });
    toast.success("Logo removed");
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setEmailSaving(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Check your inbox to confirm the new email address");
    setNewEmail("");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setNewPassword(""); setConfirmPassword("");
  }

  if (!ready || !profile) return <AppShell><PageLoader /></AppShell>;

  const trialActive = isTrialActive(profile.trial_end_date);
  const daysLeft = trialDaysLeft(profile.trial_end_date);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Settings" description="Manage your business profile, branding, and account." />

        {/* Subscription */}
        <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Subscription</p>
              <p className="mt-1 text-lg font-semibold">
                {trialActive ? <span className="inline-flex items-center gap-1.5 text-primary"><Sparkles className="h-4 w-4" />Free trial · {daysLeft} {daysLeft === 1 ? "day" : "days"} left</span>
                  : <span className="inline-flex items-center gap-1.5 text-warning-foreground"><AlertTriangle className="h-4 w-4" />Trial ended</span>}
              </p>
              <p className="text-xs text-muted-foreground">Renews / expires {new Date(profile.trial_end_date).toLocaleDateString()}</p>
            </div>
            <Button variant="outline" onClick={() => toast.info("Upgrade options coming soon!")}>Upgrade</Button>
          </div>
        </div>

        {/* Logo upload */}
        <div className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Business logo</h3>
          <p className="mt-1 text-xs text-muted-foreground">Shown on invoices and reports. PNG or JPG, under 2MB.</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
              {profile.logo_url ? (
                <img src={profile.logo_url} alt="Business logo" className="h-full w-full object-contain" />
              ) : (
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {profile.logo_url ? "Change logo" : "Upload logo"}
              </Button>
              {profile.logo_url && (
                <Button type="button" variant="ghost" onClick={removeLogo}>Remove</Button>
              )}
            </div>
          </div>
        </div>

        {/* Business profile */}
        <form onSubmit={save} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Business profile</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name"><Input value={profile.business_name ?? ""} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} maxLength={100} /></Field>
            <Field label="Email (login)"><Input value={profile.email ?? ""} disabled /></Field>
            <Field label="Phone"><Input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} maxLength={30} /></Field>
            <Field label="Your role"><Input value={profile.role ?? ""} onChange={(e) => setProfile({ ...profile, role: e.target.value })} maxLength={60} /></Field>
            <Field label="Business type"><Input value={profile.business_type ?? ""} onChange={(e) => setProfile({ ...profile, business_type: e.target.value })} maxLength={60} /></Field>
            <Field label="Employees"><Input value={profile.num_employees ?? ""} onChange={(e) => setProfile({ ...profile, num_employees: e.target.value })} maxLength={20} /></Field>
            <Field label="Location"><Input value={profile.location ?? ""} onChange={(e) => setProfile({ ...profile, location: e.target.value })} maxLength={120} /></Field>
            <Field label="Currency">
              <Select value={profile.currency} onValueChange={(v) => setProfile({ ...profile, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90">{saving ? "Saving…" : "Save changes"}</Button></div>
        </form>

        {/* Email change */}
        <form onSubmit={changeEmail} className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Change login email</h3>
          <p className="text-xs text-muted-foreground">We'll send a confirmation link to the new address.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="New email">
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="you@business.com" maxLength={255} />
            </Field>
            <Button type="submit" variant="outline" disabled={emailSaving || !newEmail.trim()}>{emailSaving ? "Sending…" : "Update email"}</Button>
          </div>
        </form>

        {/* Password change */}
        <form onSubmit={changePassword} className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Change password</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New password"><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} maxLength={128} /></Field>
            <Field label="Confirm new password"><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} maxLength={128} /></Field>
          </div>
          <div className="flex justify-end"><Button type="submit" variant="outline" disabled={passwordSaving || !newPassword}>{passwordSaving ? "Updating…" : "Update password"}</Button></div>
        </form>

        {/* Appearance */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">Appearance</h3>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Switch between light and dark.</p>
            <ThemeToggle />
          </div>
        </div>

        {/* Sign out */}
        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <h3 className="text-sm font-semibold text-destructive">Sign out</h3>
          <p className="mt-1 text-xs text-muted-foreground">You can sign back in anytime to access your data.</p>
          <Button variant="outline" className="mt-3" onClick={async () => { await signOut(); navigate({ to: "/" }); }}>
            <LogOut className="mr-1 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
