import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { SEO } from '@/components/SEO';

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Supabase recovery links land here with a session already in place.
    // Wait briefly for session to settle, then either show the form or
    // fall back to an explanatory error.
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setReady(true);
      } else {
        setError('This reset link is invalid or has expired. Request a new one.');
        setReady(true);
      }
    };
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      toast({ title: 'Password updated', description: 'You can now sign in with your new password.' });
      await supabase.auth.signOut();
      navigate('/sign-in', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEO
        title="Reset password | KudiTrack"
        description="Set a new password for your KudiTrack account."
        path="/reset-password"
        noindex
      />
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10">
          <section className="w-full rounded-lg border border-border bg-card/70 p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <Logo className="h-10 w-10" />
              <div>
                <p className="text-sm font-semibold">KudiTrack</p>
                <p className="text-xs text-muted-foreground">Set new password</p>
              </div>
            </div>

            <h1 className="text-2xl font-bold tracking-normal">Choose a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your new password must be at least 6 characters.
            </p>

            {!ready ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
              </div>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
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
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                {error && (
                  <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                )}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Update password
                </Button>
              </form>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
