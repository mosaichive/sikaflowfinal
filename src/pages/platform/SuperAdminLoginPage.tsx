import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldCheck, KeyRound, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

type Step = 'credentials' | 'mfa' | 'enroll';

interface Factor {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string | null;
}

export default function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // MFA state
  const [factor, setFactor] = useState<Factor | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');

  // Enrollment state
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);

  const verifyIsSuperAdmin = useCallback(async (userId: string) => {
    const { data, error: roleErr } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin')
      .maybeSingle();
    if (roleErr) throw roleErr;
    return !!data;
  }, []);

  const continueAfterAuth = useCallback(async () => {
    const { data: aalData, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) throw aalErr;
    const { currentLevel, nextLevel } = aalData;

    const { data: facData, error: facErr } = await supabase.auth.mfa.listFactors();
    if (facErr) throw facErr;
    const verified = (facData?.totp ?? []).find((f) => f.status === 'verified') as Factor | undefined;

    if (verified && nextLevel === 'aal2' && currentLevel !== 'aal2') {
      // Need to challenge
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: verified.id });
      if (chErr) throw chErr;
      setFactor(verified);
      setChallengeId(ch.id);
      setStep('mfa');
      return;
    }

    if (!verified) {
      // Force enrollment before granting dashboard
      const { data: en, error: enErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Super Admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enErr) throw enErr;
      setEnroll({ factorId: en.id, qr: en.totp.qr_code, secret: en.totp.secret });
      setStep('enroll');
      return;
    }

    // Fully authenticated
    navigate('/super-admin', { replace: true });
  }, [navigate]);

  // If user is already signed in (e.g. session restored), resume the flow.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || cancelled) return;
      try {
        const isSA = await verifyIsSuperAdmin(user.id);
        if (!isSA) {
          await supabase.auth.signOut();
          return;
        }
        const forced = params.get('step');
        if (forced === 'enroll' || forced === 'mfa') {
          await continueAfterAuth();
        } else {
          await continueAfterAuth();
        }
      } catch (e: any) {
        setError(e?.message ?? 'Could not resume session.');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signErr) throw signErr;
      const userId = data.user?.id;
      if (!userId) throw new Error('Sign-in failed.');

      const isSA = await verifyIsSuperAdmin(userId);
      if (!isSA) {
        await supabase.auth.signOut();
        throw new Error('This account is not authorized for Super Admin access.');
      }
      await continueAfterAuth();
    } catch (err: any) {
      setError(err?.message ?? 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factor || !challengeId) return;
    setError('');
    setSubmitting(true);
    try {
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      toast({ title: 'Signed in', description: 'MFA verified successfully.' });
      navigate('/super-admin', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'Invalid code.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enroll) return;
    setError('');
    setSubmitting(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (vErr) throw vErr;
      toast({ title: 'MFA enabled', description: 'Authenticator activated. Welcome.' });
      navigate('/super-admin', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'Verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelToCredentials = async () => {
    if (enroll) {
      try { await supabase.auth.mfa.unenroll({ factorId: enroll.factorId }); } catch { /* ignore */ }
    }
    await supabase.auth.signOut();
    setEnroll(null);
    setFactor(null);
    setChallengeId(null);
    setCode('');
    setStep('credentials');
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-12 w-12" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">Platform Access</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Super Admin Sign-In</h1>
            <p className="mt-1 text-sm text-muted-foreground">Restricted to platform administrators.</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {step === 'credentials' && (<><Lock className="h-4 w-4" /> Step 1 of 2 · Credentials</>)}
              {step === 'mfa' && (<><ShieldCheck className="h-4 w-4 text-primary" /> Step 2 of 2 · Authentication code</>)}
              {step === 'enroll' && (<><KeyRound className="h-4 w-4 text-primary" /> Enroll authenticator</>)}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {step === 'credentials' && (
              <form onSubmit={submitCredentials} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sa-email">Email</Label>
                  <Input
                    id="sa-email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sa-password">Password</Label>
                  <PasswordInput
                    id="sa-password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Continue
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  <Link to="/forgot-password" className="font-medium text-primary hover:underline">Forgot password?</Link>
                </p>
              </form>
            )}

            {step === 'mfa' && (
              <form onSubmit={submitMfa} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code from your authenticator app to finish signing in.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="sa-code">Authentication code</Label>
                  <Input
                    id="sa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify & sign in
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={cancelToCredentials} disabled={submitting}>
                  Cancel
                </Button>
              </form>
            )}

            {step === 'enroll' && enroll && (
              <form onSubmit={submitEnroll} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  MFA is required for Super Admin access. Scan the QR code with an authenticator app,
                  then enter the code below to activate.
                </p>
                <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-4 bg-card">
                  <img src={enroll.qr} alt="MFA QR code" className="h-44 w-44" />
                  <div className="text-xs text-muted-foreground">Or enter secret manually:</div>
                  <code className="text-xs font-mono break-all px-2 py-1 rounded bg-muted">{enroll.secret}</code>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sa-enroll-code">6-digit code</Label>
                  <Input
                    id="sa-enroll-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Verify & activate
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={cancelToCredentials} disabled={submitting}>
                  Cancel
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Not a Super Admin? <Link to="/sign-in" className="text-primary hover:underline">Go to standard sign-in</Link>
        </p>
      </div>
    </main>
  );
}
