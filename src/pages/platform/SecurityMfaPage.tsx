import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { ShieldCheck, ShieldOff, Loader2, KeyRound } from 'lucide-react';

interface Factor {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
}

export default function SecurityMfaPage() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [friendlyName, setFriendlyName] = useState('Authenticator');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast({ title: 'Could not load MFA factors', description: error.message, variant: 'destructive' });
    } else {
      const totp = (data?.totp ?? []) as Factor[];
      const all = (data?.all ?? []) as Factor[];
      setFactors(totp.length ? totp : all.filter((f) => f.factor_type === 'totp'));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName || `Authenticator ${new Date().toISOString()}`,
      });
      if (error) throw error;
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (e: any) {
      toast({ title: 'Enrollment failed', description: e?.message ?? 'Try again', variant: 'destructive' });
    } finally {
      setEnrolling(false);
    }
  };

  const verifyEnroll = async () => {
    if (!enroll) return;
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      toast({ title: 'MFA enabled', description: 'TOTP is now active on your account.' });
      setEnroll(null);
      setCode('');
      await load();
    } catch (e: any) {
      toast({ title: 'Verification failed', description: e?.message ?? 'Invalid code', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async () => {
    if (!enroll) return;
    try { await supabase.auth.mfa.unenroll({ factorId: enroll.factorId }); } catch { /* ignore */ }
    setEnroll(null);
    setCode('');
    await load();
  };

  const removeFactor = async (factorId: string) => {
    if (!confirm('Remove this MFA factor? You will no longer be required to enter a code at sign-in.')) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast({ title: 'MFA factor removed' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not remove factor', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const verifiedFactors = factors.filter((f) => f.status === 'verified');

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" /> Multi-Factor Authentication
        </h1>
        <p className="text-sm text-muted-foreground">Add a time-based one-time password (TOTP) to protect your account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active authenticators</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</p>
          ) : verifiedFactors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No MFA factors enrolled yet.</p>
          ) : (
            verifiedFactors.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{f.friendly_name || 'Authenticator'}</p>
                    <p className="text-xs text-muted-foreground">TOTP · {f.status}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => removeFactor(f.id)} disabled={busy}>
                  <ShieldOff className="h-4 w-4 mr-1" /> Remove
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enroll a new authenticator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!enroll ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="fname">Device name</Label>
                <Input id="fname" value={friendlyName} onChange={(e) => setFriendlyName(e.target.value)} placeholder="e.g. iPhone Authenticator" />
              </div>
              <Button onClick={startEnroll} disabled={enrolling}>
                {enrolling ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Preparing…</> : 'Start enrollment'}
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Scan this QR code with Google Authenticator, 1Password, or any TOTP app, then enter the 6-digit code below.
              </div>
              <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-4 bg-card">
                <img src={enroll.qr} alt="MFA QR code" className="h-44 w-44" />
                <div className="text-xs text-muted-foreground">Or enter secret manually:</div>
                <code className="text-xs font-mono break-all px-2 py-1 rounded bg-muted">{enroll.secret}</code>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={verifyEnroll} disabled={busy || code.length !== 6}>
                  {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifying…</> : 'Verify & enable'}
                </Button>
                <Button variant="ghost" onClick={cancelEnroll} disabled={busy}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
