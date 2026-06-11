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

function friendlyAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const msg = raw.toLowerCase();
  if (!isSupabaseConfigured) {
    return 'Supabase is not connected. Please configure environment variables.';
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return 'Cannot connect to authentication server. Check your internet connection or Supabase URL and anon key.';
  }
  if (msg.includes('invalid api key') || msg.includes('invalid jwt')) {
    return 'Authentication is misconfigured. Check Supabase URL and anon key.';
  }
  return raw || 'Authentication failed. Please try again.';
}
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getOrCreateReferralDeviceId, getPendingReferralToken, setPendingReferralToken } from '@/lib/referrals';

type AuthMode = 'sign-in' | 'sign-up';
type SignupChannel = 'email' | 'phone';
type PhoneStage = 'collect' | 'verify';

function AuthShell({ children }: { children: ReactNode }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      {/* Top-right navigation */}
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

function AuthPanel({ initialMode }: { initialMode: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [signupChannel, setSignupChannel] = useState<SignupChannel>('email');
  const [phoneStage, setPhoneStage] = useState<PhoneStage>('collect');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const referralToken = useMemo(
    () => new URLSearchParams(location.search).get('ref')?.trim() || getPendingReferralToken(),
    [location.search],
  );

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

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    navigate(`${nextMode === 'sign-in' ? '/sign-in' : '/sign-up'}${location.search}`, { replace: true, state: location.state });
  };

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

  const sendPhoneOtp = async () => {
    setError('');
    if (!fullName.trim()) { setError('Enter your full name.'); return; }
    if (!phone.trim()) { setError('Enter your phone number.'); return; }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setSubmitting(true);
    try {
      const { error: fnErr } = await supabase.functions.invoke('phone-signup-send-otp', {
        body: { phone: phone.trim() },
      });
      if (fnErr) throw fnErr;
      toast({ title: 'Code sent', description: 'Enter the 6-digit code we just texted you.' });
      setPhoneStage('verify');
    } catch (err) {
      setError((err as Error).message || 'Failed to send code.');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyPhoneOtp = async () => {
    setError('');
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('phone-signup-verify-otp', {
        body: {
          phone: phone.trim(),
          otp: otpCode,
          password,
          full_name: fullName.trim(),
          email: email.trim() || undefined,
          referral_token: referralToken || undefined,
          signup_device_id: getOrCreateReferralDeviceId(),
          redirect_to: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (fnErr) throw fnErr;
      const link = (data as { action_link?: string } | null)?.action_link;
      if (link) {
        window.location.href = link;
        return;
      }
      toast({ title: 'Account created', description: 'Sign in with your email and password to continue.' });
      setMode('sign-in');
      setSignupChannel('email');
      setPhoneStage('collect');
      setOtpCode('');
    } catch (err) {
      setError((err as Error).message || 'Invalid or expired code.');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (mode === 'sign-up' && signupChannel === 'phone') {
      if (phoneStage === 'collect') {
        await sendPhoneOtp();
      } else {
        await verifyPhoneOtp();
      }
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        navigate(afterAuthPath, { replace: true });
        return;
      }

      if (!fullName.trim()) {
        throw new Error('Enter your full name to create the account.');
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: fullName.trim(),
            full_name: fullName.trim(),
            referral_token: referralToken || undefined,
            signup_device_id: getOrCreateReferralDeviceId(),
          },
          emailRedirectTo: redirectTo,
        },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        toast({ title: 'Account created', description: 'Your 30-day trial setup starts on the dashboard.' });
        navigate('/dashboard', { replace: true });
        return;
      }

      toast({
        title: 'Confirm your email',
        description: 'Open the confirmation link, then sign in to continue to your dashboard.',
      });
      setMode('sign-in');
      navigate('/sign-in', { replace: true });
    } catch (authError: unknown) {
      setError(friendlyAuthError(authError));
    } finally {
      setSubmitting(false);
    }
  };

  const usePhone = mode === 'sign-up' && signupChannel === 'phone';
  const onVerifyStage = usePhone && phoneStage === 'verify';

  return (
    <>
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          {mode === 'sign-in' ? 'Welcome back' : 'Start free'}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-normal">
          {mode === 'sign-in' ? 'Sign in to KudiTrack' : 'Create your account'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'sign-in'
            ? 'Use your existing business account to continue.'
            : 'Your account opens the dashboard first, then a quick setup dialog.'}
        </p>
        {referralToken && (
          <p className="mt-2 text-xs text-primary">
            Referral applied. Create your account to link this signup to the annual referral program.
          </p>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-lg border border-border bg-muted p-1">
        <button
          type="button"
          onClick={() => switchMode('sign-in')}
          className={cn(
            'h-9 rounded-md text-sm font-medium transition-colors',
            mode === 'sign-in' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode('sign-up')}
          className={cn(
            'h-9 rounded-md text-sm font-medium transition-colors',
            mode === 'sign-up' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Sign up
        </button>
      </div>

      {location.search.includes('reason=removed') && (
        <Alert className="mt-4">
          <AlertDescription>
            This account was removed from KudiTrack. Sign up again, or ask an admin to invite you back.
          </AlertDescription>
        </Alert>
      )}

      {mode === 'sign-up' && (
        <div className="mb-4 grid grid-cols-2 rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => { setSignupChannel('email'); setError(''); setPhoneStage('collect'); setOtpCode(''); }}
            className={cn(
              'h-9 rounded-md text-sm font-medium transition-colors',
              signupChannel === 'email' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => { setSignupChannel('phone'); setError(''); }}
            className={cn(
              'h-9 rounded-md text-sm font-medium transition-colors',
              signupChannel === 'phone' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Phone number
          </button>
        </div>
      )}

      <form className="space-y-4" onSubmit={submit}>
        {mode === 'sign-up' && (
          <div className="space-y-2">
            <Label htmlFor="full-name">Full name</Label>
            <Input
              id="full-name"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Ama Mensah"
              disabled={onVerifyStage}
              required
            />
          </div>
        )}

        {usePhone ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+233 24 123 4567"
                disabled={onVerifyStage}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-optional">Email (optional)</Label>
              <Input
                id="email-optional"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@business.com"
                disabled={onVerifyStage}
              />
              <p className="text-xs text-muted-foreground">Used for password recovery. You can add this later.</p>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@business.com"
              required
            />
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === 'sign-in' && (
              <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            disabled={onVerifyStage}
            required
          />
        </div>

        {onVerifyStage && (
          <div className="space-y-2">
            <Label htmlFor="otp">6-digit verification code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              required
            />
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setPhoneStage('collect'); setOtpCode(''); setError(''); }}
            >
              Use a different phone number
            </button>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={submitting || (onVerifyStage && otpCode.length !== 6)}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'sign-in'
            ? 'Sign in'
            : usePhone
              ? (onVerifyStage ? 'Verify & create account' : 'Send verification code')
              : 'Create account'}
        </Button>
      </form>


      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={submitting}
        onClick={handleGoogle}
      >
        <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.3 0-11.5-5.2-11.5-11.5S17.7 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.9 6.5 29.2 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z"/>
          <path fill="#4CAF50" d="M24 43.5c5.1 0 9.8-2 13.3-5.2l-6.1-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5.2C40.8 36 43.5 30.5 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
        </svg>
        Continue with Google
      </Button>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        <Link to="/phone-login" className="font-medium text-primary hover:underline">
          Sign in with phone number
        </Link>
      </p>

      {mode === 'sign-up' && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          New businesses start with a 30-day free trial. No card required.
        </p>
      )}
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
        <AuthPanel initialMode="sign-in" />
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
        <AuthPanel initialMode="sign-up" />
      </AuthShell>
    </>
  );
}
