import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RotateCw } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/SEO';
import { getOtpErrorMessage, isValidE164, normalizeGhanaPhone } from '@/lib/phone-otp';

const RESEND_COOLDOWN_SEC = 60;

export function PhoneLoginPage() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'request' | 'verify'>('request');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async (isResend = false) => {
    setError('');
    const normalized = normalizeGhanaPhone(phone);
    if (!isValidE164(normalized)) {
      setError('Please enter a valid phone number (e.g. 0244123456 or +233244123456).');
      return;
    }
    if (isResend) setResending(true); else setSubmitting(true);
    try {
      const { error: fnErr } = await supabase.functions.invoke('phone-login-send-otp', {
        body: { phone: normalized },
      });
      if (fnErr) throw fnErr;
      toast({
        title: 'Verification code sent',
        description: `If ${normalized} is registered, an SMS code has been sent. Please check your SMS.`,
      });
      setStage('verify');
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      const message = await getOtpErrorMessage(err);
      console.error('[phone-login] send failed', err);
      setError(message);
    } finally {
      setSubmitting(false);
      setResending(false);
    }
  };

  const sendCode = (e: React.FormEvent) => {
    e.preventDefault();
    void requestCode(false);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const normalized = normalizeGhanaPhone(phone);
      const { data, error: fnErr } = await supabase.functions.invoke('phone-login-verify-otp', {
        body: { phone: normalized, otp: code, redirect_to: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (fnErr) throw fnErr;
      const link = (data as { action_link?: string } | null)?.action_link;
      if (!link) throw new Error('Could not start session');
      window.location.href = link;
    } catch (err) {
      const message = await getOtpErrorMessage(err, 'That code is invalid or expired.');
      console.error('[phone-login] verify failed', err);
      setError(message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEO
        title="Phone login | KudiTrack"
        description="Sign in to KudiTrack with your verified phone number."
        path="/phone-login"
        noindex
      />
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10">
          <div className="mb-6 flex items-center gap-3">
            <Logo className="h-10 w-10" />
            <div>
              <p className="text-sm font-semibold">KudiTrack</p>
              <p className="text-xs text-muted-foreground">Phone sign-in</p>
            </div>
          </div>
          <div className="w-full rounded-lg border border-border bg-card/70 p-6 shadow-sm">
            <h1 className="text-2xl font-bold">Sign in with your phone</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {stage === 'request'
                ? 'Enter your verified phone number to receive a one-time code.'
                : 'Enter the 6-digit code we sent to your phone.'}
            </p>

            {stage === 'request' ? (
              <form className="mt-5 space-y-4" onSubmit={sendCode}>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0244 123 4567 or +233244123456"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Ghana numbers can be entered as 024xxxxxxx — we'll convert to +233 automatically.
                  </p>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {error}{' '}
                      <button
                        type="button"
                        className="font-medium underline"
                        onClick={() => navigate('/sign-in')}
                      >
                        Use email instead
                      </button>
                    </AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send code
                </Button>
              </form>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={verifyCode}>
                <div className="space-y-2">
                  <Label htmlFor="code">6-digit code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                  />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & sign in
                </Button>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={cooldown > 0 || resending}
                    onClick={() => void requestCode(true)}
                  >
                    {resending ? (
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCw className="mr-2 h-3 w-3" />
                    )}
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => { setStage('request'); setCode(''); setError(''); }}
                  >
                    Use a different number
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 text-center text-xs text-muted-foreground">
              Prefer email?{' '}
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => navigate('/sign-in')}
              >
                Sign in with email
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export default PhoneLoginPage;
