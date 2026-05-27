import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

type Step = 'enter' | 'verify';

const RESEND_COOLDOWN_SEC = 30;

function EmailReset() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <Alert className="mt-4">
        <AlertDescription>
          If an account exists for <strong>{email}</strong>, a reset link has been sent.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          required
        />
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Send reset link
      </Button>
    </form>
  );
}

function PhoneReset() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<Step>('enter');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendOtp = async () => {
    setError('');
    if (phone.trim().length < 9) {
      setError('Enter a valid phone number.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('password-reset-send-otp', {
        body: { phone: phone.trim() },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      setStep('verify');
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) { setError('Enter the 6-digit code.'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('password-reset-verify-otp', {
        body: {
          phone: phone.trim(),
          otp,
          new_password: newPassword,
          redirect_to: `${window.location.origin}/dashboard`,
        },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      const link = (data as any)?.action_link;
      setDone(true);
      if (link) {
        // Sign the user in immediately.
        window.location.href = link;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Alert className="mt-4">
        <AlertDescription>
          Password updated. Signing you in…
        </AlertDescription>
      </Alert>
    );
  }

  if (step === 'enter') {
    return (
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="reset-phone">Verified phone number</Label>
          <Input
            id="reset-phone"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0241234567"
          />
          <p className="text-[11px] text-muted-foreground">
            We'll send a 6-digit code by SMS. Your number must have been verified in Settings.
          </p>
        </div>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <Button type="button" className="w-full" onClick={sendOtp} disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Send reset code
        </Button>
      </div>
    );
  }

  return (
    <form className="mt-4 space-y-4" onSubmit={verifyAndReset}>
      <div className="space-y-2">
        <Label htmlFor="reset-otp">6-digit code</Label>
        <Input
          id="reset-otp"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-new-password">New password</Label>
        <Input
          id="reset-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 8 characters with upper, lower and number"
          required
        />
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Reset password
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={sendOtp}
          disabled={submitting || cooldown > 0}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </Button>
      </div>
    </form>
  );
}

export default function ForgotPasswordPage() {
  const location = useLocation();
  const initial = useMemo(() => {
    const m = new URLSearchParams(location.search).get('method');
    return m === 'phone' ? 'phone' : 'email';
  }, [location.search]);

  return (
    <>
      <Helmet>
        <title>Forgot password | KudiTrack</title>
        <meta name="description" content="Reset your KudiTrack account password by email or verified phone number." />
        <link rel="canonical" href="https://kuditrack.online/forgot-password" />
      </Helmet>
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10">
          <section className="w-full rounded-lg border border-border bg-card/70 p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Logo className="h-10 w-10" />
              <div>
                <p className="text-sm font-semibold">KudiTrack</p>
                <p className="text-xs text-muted-foreground">Forgot password</p>
              </div>
            </div>

            <h1 className="text-2xl font-bold tracking-normal">Reset your password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose how you'd like to recover access.
            </p>

            <Tabs defaultValue={initial} className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="phone">Phone OTP</TabsTrigger>
              </TabsList>
              <TabsContent value="email"><EmailReset /></TabsContent>
              <TabsContent value="phone"><PhoneReset /></TabsContent>
            </Tabs>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Remembered it?{' '}
              <Link to="/sign-in" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
