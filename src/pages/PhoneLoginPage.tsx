import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/SEO';

export function PhoneLoginPage() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'request' | 'verify'>('request');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { error: fnErr } = await supabase.functions.invoke('phone-login-send-otp', {
        body: { phone },
      });
      if (fnErr) throw fnErr;
      toast({ title: 'Code sent', description: 'If that phone is registered, an SMS code is on its way.' });
      setStage('verify');
    } catch (err) {
      setError((err as Error).message || 'Failed to send code');
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('phone-login-verify-otp', {
        body: { phone, otp: code, redirect_to: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (fnErr) throw fnErr;
      const link = (data as { action_link?: string } | null)?.action_link;
      if (!link) throw new Error('Could not start session');
      window.location.href = link;
    } catch (err) {
      setError((err as Error).message || 'Invalid code');
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
                    placeholder="+233 24 123 4567"
                    required
                  />
                </div>
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
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
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                <Button type="submit" className="w-full" disabled={submitting || code.length !== 6}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify & sign in
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setStage('request'); setCode(''); setError(''); }}
                >
                  Use a different phone number
                </button>
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
