import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
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

  return (
    <>
      <Helmet>
        <title>Forgot password | KudiTrack</title>
        <meta name="description" content="Reset your KudiTrack account password by email." />
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
              Enter your account email. We will send you a secure reset link.
            </p>

            {sent ? (
              <Alert className="mt-5">
                <AlertDescription>
                  If an account exists for <strong>{email}</strong>, a reset link has been sent.
                  Open the link from your inbox to set a new password.
                </AlertDescription>
              </Alert>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
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
                {error && (
                  <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </form>
            )}

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
