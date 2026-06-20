import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Info, MessageSquareText } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { AboutModal } from '@/components/auth/AboutModal';
import { ContactModal } from '@/components/auth/ContactModal';
import { SEO } from '@/components/SEO';
import { getOtpErrorMessage, isValidE164, normalizeGhanaPhone } from '@/lib/phone-otp';
import { getFunctionErrorMessage } from '@/lib/function-errors';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { getOrCreateReferralDeviceId, getPendingReferralToken, setPendingReferralToken } from '@/lib/referrals';

type AuthMode = 'sign-in' | 'sign-up';

function friendlyAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const msg = raw.toLowerCase();
  if (!isSupabaseConfigured) {
    return 'Backend is not connected. Please configure environment variables.';
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return 'Cannot connect to authentication server. Check your internet connection.';
  }
  if (msg.includes('invalid api key') || msg.includes('invalid jwt')) {
    return 'Authentication is misconfigured. Please contact support.';
  }
  return raw || 'Authentication failed. Please try again.';
}

function looksLikeEmail(value: string) {
  return /.+@.+\..+/.test(value.trim());
}

function AuthShell({ children }: { children: ReactNode }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 sm:right-6 sm:top-6">
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring sm:px-4 sm:py-2 sm:text-sm"
        >
          <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span>About</span>
        </button>
        <button
          type="button"
          onClick={() => setContactOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card hover:text-primary focus:outline-none focus:ring-2 focus:ring-ring sm:px-4 sm:py-2 sm:text-sm"
        >
          <MessageSquareText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span>Contact Us</span>
        </button>
      </div>

      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
        <div className="grid w-full gap-8 lg:grid-cols-[0.9fr_1fr] lg:items-center">
          <section className="hidden space-y-6 lg:block">
            <div className="flex items-center gap-3">
              <Logo className="h-11 w-11" />
              <div>
                <p className="text-sm font-semibold tracking-tight">KudiTrack</p>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Sales tally system</p>
              </div>
            </div>
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Business workspace</p>
              <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-normal">
                Simple sales, stock, and cash control for daily business.
              </h1>
              <p className="max-w-lg text-base leading-7 text-muted-foreground">
                Sign in or start a 30-day trial. Pricing stays out of setup so you can get to the dashboard first.
              </p>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md rounded-lg border border-border bg-card/70 p-4 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <Logo className="h-10 w-10" />
              <div>
                <p className="text-sm font-semibold">KudiTrack</p>
                <p className="text-xs text-muted-foreground">Sales tally system</p>
              </div>
            </div>
            {children}
          </section>
        </div>
      </div>

      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
      <ContactModal open={contactOpen} onOpenChange={setContactOpen} />
    </main>
  );
}

function GoogleButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" className="w-full" disabled={disabled} onClick={onClick}>
      <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.3 0-11.5-5.2-11.5-11.5S17.7 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 43.5c5.1 0 9.8-2 13.3-5.2l-6.1-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5.2C40.8 36 43.5 30.5 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
      </svg>
      Continue with Google
    </Button>
  );
}

function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function useAuthRedirect() {
  const location = useLocation();
  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') return '/dashboard';
    const from = (location.state as { from?: string } | null)?.from;
    const nextPath = from && !from.startsWith('/sign-') && !from.startsWith('/auth') ? from : '/dashboard';
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
  }, [location.state]);
  const afterAuthPath = useMemo(() => {
    const from = (location.state as { from?: string } | null)?.from;
    return from && !from.startsWith('/sign-') && !from.startsWith('/auth') ? from : '/dashboard';
  }, [location.state]);
  return { redirectTo, afterAuthPath };
}

function SignInPanel() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { redirectTo, afterAuthPath } = useAuthRedirect();

  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: redirectTo,
        extraParams: { prompt: 'select_account' },
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate(afterAuthPath, { replace: true });
    } catch (authError: unknown) {
      setError(friendlyAuthError(authError));
      setSubmitting(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      let email = identifier.trim();
      if (!looksLikeEmail(email)) {
        const normalized = normalizeGhanaPhone(email);
        if (!isValidE164(normalized)) {
          throw new Error('Enter your email address or a valid phone number (e.g. 0244123456).');
        }
        const { data, error: fnErr } = await supabase.functions.invoke('resolve-phone-login', {
          body: { phone: normalized },
        });
        if (fnErr) {
          const message = await getFunctionErrorMessage(fnErr, 'Could not sign in with this phone number.');
          throw new Error(message);
        }
        const resolved = (data as { email?: string } | null)?.email;
        if (!resolved) throw new Error('No account is registered with this phone number.');
        email = resolved;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      navigate(afterAuthPath, { replace: true });
    } catch (authError: unknown) {
      setError(friendlyAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Welcome back</p>
        <h2 className="mt-2 text-2xl font-bold tracking-normal">Sign in to KudiTrack</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use your existing business account to continue.</p>
      </div>

      {location.search.includes('reason=removed') && (
        <Alert className="mb-4">
          <AlertDescription>
            This account was removed from KudiTrack. Sign up again, or ask an admin to invite you back.
          </AlertDescription>
        </Alert>
      )}

      <GoogleButton disabled={submitting} onClick={handleGoogle} />
      <OrDivider />

      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="identifier">Email / Phone Number</Label>
          <Input
            id="identifier"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Enter your email or verified phone number"
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign In
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link to="/sign-up" className="font-medium text-primary hover:underline">
          Create Account
        </Link>
      </p>
    </>
  );
}

function SignUpPanel() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [otpStage, setOtpStage] = useState<'idle' | 'sending' | 'collect' | 'verifying'>('idle');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { redirectTo, afterAuthPath } = useAuthRedirect();

  const referralToken = useMemo(
    () => new URLSearchParams(location.search).get('ref')?.trim() || getPendingReferralToken(),
    [location.search],
  );

  useEffect(() => {
    const queryToken = new URLSearchParams(location.search).get('ref')?.trim();
    if (queryToken) setPendingReferralToken(queryToken);
  }, [location.search]);

  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: redirectTo,
        extraParams: { prompt: 'select_account' },
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate(afterAuthPath, { replace: true });
    } catch (authError: unknown) {
      setError(friendlyAuthError(authError));
      setSubmitting(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!fullName.trim()) { setError('Enter your full name.'); return; }
    if (!looksLikeEmail(email)) { setError('Enter a valid email address.'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }

    let normalizedPhone = '';
    if (phone.trim()) {
      normalizedPhone = normalizeGhanaPhone(phone);
      if (!isValidE164(normalizedPhone)) {
        setError('Enter a valid phone number, or leave it empty.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: fullName.trim(),
            full_name: fullName.trim(),
            phone: normalizedPhone || undefined,
            referral_token: referralToken || undefined,
            signup_device_id: getOrCreateReferralDeviceId(),
          },
          emailRedirectTo: redirectTo,
        },
      });
      if (signUpError) throw signUpError;

      // Persist phone (unverified) on the profile if we have a session.
      if (data.session && normalizedPhone && data.user) {
        await supabase
          .from('profiles')
          .update({ phone: normalizedPhone, phone_verified: false })
          .eq('id', data.user.id);
      }

      if (data.session) {
        toast({ title: 'Account created', description: 'Your 30-day trial setup starts on the dashboard.' });

        // Offer to verify the phone now if one was provided.
        if (normalizedPhone) {
          setOtpStage('sending');
          try {
            const { error: fnErr } = await supabase.functions.invoke('send-signup-otp', {
              body: { phone: normalizedPhone },
            });
            if (fnErr) throw fnErr;
            setOtpStage('collect');
            return;
          } catch (otpErr) {
            console.warn('[signup] phone OTP send failed', otpErr);
            toast({
              title: 'Account ready',
              description: 'You can verify your phone later from Settings.',
            });
            navigate('/dashboard', { replace: true });
            return;
          }
        }

        navigate('/dashboard', { replace: true });
        return;
      }

      toast({
        title: 'Confirm your email',
        description: 'Open the confirmation link, then sign in to continue to your dashboard.',
      });
      navigate('/sign-in', { replace: true });
    } catch (authError: unknown) {
      setError(friendlyAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyPhone = async () => {
    setOtpError('');
    setOtpStage('verifying');
    try {
      const normalized = normalizeGhanaPhone(phone);
      const { error: fnErr } = await supabase.functions.invoke('verify-signup-otp', {
        body: { phone: normalized, otp: otpCode },
      });
      if (fnErr) throw fnErr;
      toast({ title: 'Phone verified', description: 'You can now receive SMS notifications.' });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = await getOtpErrorMessage(err, 'Invalid or expired code.');
      setOtpError(message);
      setOtpStage('collect');
    }
  };

  if (otpStage === 'collect' || otpStage === 'verifying' || otpStage === 'sending') {
    return (
      <>
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">One last step</p>
          <h2 className="mt-2 text-2xl font-bold tracking-normal">Verify your phone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the 6-digit code we sent to {normalizeGhanaPhone(phone)}. You can skip and verify later from Settings.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp">Verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              disabled={otpStage !== 'collect'}
            />
          </div>

          {otpError && (
            <Alert variant="destructive">
              <AlertDescription>{otpError}</AlertDescription>
            </Alert>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={verifyPhone}
            disabled={otpStage !== 'collect' || otpCode.length !== 6}
          >
            {otpStage === 'verifying' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Verify phone
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => navigate('/dashboard', { replace: true })}
          >
            Skip for now
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Start free</p>
        <h2 className="mt-2 text-2xl font-bold tracking-normal">Create your account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account opens the dashboard first, then a quick setup dialog.
        </p>
        {referralToken && (
          <p className="mt-2 text-xs text-primary">
            Referral applied. Create your account to link this signup to the annual referral program.
          </p>
        )}
      </div>

      <GoogleButton disabled={submitting} onClick={handleGoogle} />
      <OrDivider />

      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="full-name">Full Name</Label>
          <Input
            id="full-name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ama Mensah"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">
            Phone Number <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0244 123 4567"
          />
          <p className="text-xs text-muted-foreground">
            Verify your phone number to receive SMS notifications and account recovery benefits.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        New businesses start with a 30-day free trial. No card required.
      </p>
    </>
  );
}

export function SignInPage() {
  return (
    <>
      <SEO
        title="Sign in | KudiTrack"
        description="Sign in to your KudiTrack business workspace to manage sales, stock, expenses and profit."
        path="/sign-in"
        noindex
      />
      <AuthShell>
        <SignInPanel />
      </AuthShell>
    </>
  );
}

export function SignUpPage() {
  return (
    <>
      <SEO
        title="Sign up | KudiTrack - Start your 30-day free trial"
        description="Create a free KudiTrack account and start a 30-day trial to track daily sales, stock, expenses and profit in one dashboard."
        path="/sign-up"
      />
      <AuthShell>
        <SignUpPanel />
      </AuthShell>
    </>
  );
}
