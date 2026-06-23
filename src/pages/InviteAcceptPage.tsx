import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ALL_MODULES, type ModuleKey } from '@/lib/permissions';

type InvitePreview = {
  found: boolean;
  email?: string;
  display_name?: string | null;
  role?: string;
  modules?: ModuleKey[];
  status?: string;
  expires_at?: string;
  business_name?: string | null;
};

export default function InviteAcceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [submitting, setSubmitting] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [password, setPassword] = useState('');

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('preview_staff_invite', { _token: token });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const p = data as InvitePreview;
    if (!p?.found) {
      setError('Invitation not found or has been revoked.');
      return;
    }
    setPreview(p);
    setFullName(p.display_name || '');
  }, [token]);

  useEffect(() => {
    if (token) void fetchPreview();
  }, [token, fetchPreview]);

  const acceptInvite = useCallback(async () => {
    setAccepting(true);
    const { data, error } = await (supabase as any).rpc('accept_staff_invite', {
      _token: token,
      _full_name: fullName || null,
      _position: position || null,
    });
    setAccepting(false);
    if (error) {
      toast({ title: 'Could not accept invite', description: error.message, variant: 'destructive' });
      return false;
    }
    await refreshProfile();
    toast({
      title: `Welcome to ${(data as any)?.business_name || 'the team'}!`,
      description: `You're signed in as ${(data as any)?.role || 'staff'}.`,
    });
    navigate('/dashboard', { replace: true });
    return true;
  }, [token, fullName, position, refreshProfile, toast, navigate]);

  // If invitee is already signed in with the matching email, show one-click join.
  useEffect(() => {
    if (!preview?.found || !user || authLoading) return;
    // auto nothing — show join button
  }, [preview, user, authLoading]);

  const submitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview?.email) return;
    setSubmitting(true);
    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email: preview.email,
          password,
          options: {
            data: { display_name: fullName, full_name: fullName, title: position },
            emailRedirectTo: `${window.location.origin}/invite/${token}`,
          },
        });
        if (signUpError) throw signUpError;
        // If session was created (auto-confirm), accept immediately.
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session) {
          await acceptInvite();
        } else {
          toast({
            title: 'Confirm your email',
            description: 'Open the confirmation link, then return here to join the team.',
          });
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: preview.email,
          password,
        });
        if (signInError) throw signInError;
        await acceptInvite();
      }
    } catch (err) {
      toast({
        title: mode === 'signup' ? 'Could not create account' : 'Sign in failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const continueGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/invite/${token}`,
        queryParams: { login_hint: preview?.email || '', prompt: 'select_account' },
      },
    });
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (error || !preview?.found) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-3">
          <Logo className="h-10 w-10 mx-auto" />
          <h1 className="text-lg font-semibold">Invite unavailable</h1>
          <p className="text-sm text-muted-foreground">{error || 'This invite is no longer valid.'}</p>
          <Button variant="outline" onClick={() => navigate('/sign-in')}>Go to sign in</Button>
        </div>
      </main>
    );
  }

  const expired = preview.status !== 'pending' || (preview.expires_at && new Date(preview.expires_at) < new Date());

  if (expired) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 text-center space-y-3">
          <Logo className="h-10 w-10 mx-auto" />
          <h1 className="text-lg font-semibold">Invite {preview.status === 'accepted' ? 'already used' : 'expired'}</h1>
          <p className="text-sm text-muted-foreground">Ask the business owner to send a new invitation.</p>
          <Button variant="outline" onClick={() => navigate('/sign-in')}>Go to sign in</Button>
        </div>
      </main>
    );
  }

  const moduleLabels = (preview.modules || []).map((k) => ALL_MODULES.find((m) => m.key === k)?.label || k);

  // Already signed in?
  const signedInEmailMatches = user && user.email?.toLowerCase() === preview.email?.toLowerCase();
  const signedInWrongAccount = user && !signedInEmailMatches;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full rounded-lg border border-border bg-card p-6 space-y-5">
        <div className="text-center space-y-2">
          <Logo className="h-10 w-10 mx-auto" />
          <h1 className="text-xl font-bold tracking-tight">
            Join {preview.business_name || 'the team'}
          </h1>
          <p className="text-sm text-muted-foreground">
            You've been invited as <span className="font-medium capitalize">{preview.role}</span>.
          </p>
        </div>

        <div className="rounded-md bg-muted/40 border border-border p-3 space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Access</p>
          <div className="flex flex-wrap gap-1">
            {moduleLabels.map((label) => (
              <Badge key={label} variant="secondary" className="text-[10px]">{label}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-1">Invite for <span className="font-medium">{preview.email}</span></p>
        </div>

        {signedInWrongAccount ? (
          <Alert variant="destructive">
            <AlertDescription>
              You're signed in as <strong>{user?.email}</strong> but this invite is for <strong>{preview.email}</strong>.
              Sign out and sign in with the correct account.
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={async () => { await supabase.auth.signOut(); }}>
                Sign out
              </Button>
            </AlertDescription>
          </Alert>
        ) : signedInEmailMatches ? (
          <Button className="w-full" onClick={() => void acceptInvite()} disabled={accepting}>
            {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Check className="mr-2 h-4 w-4" /> Join {preview.business_name || 'team'}
          </Button>
        ) : (
          <>
            <div className="grid grid-cols-2 rounded-lg border border-border bg-muted p-1">
              <button
                type="button"
                onClick={() => setMode('signup')}
                className={`h-9 rounded-md text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className={`h-9 rounded-md text-sm font-medium transition-colors ${mode === 'signin' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                I already have one
              </button>
            </div>

            <form className="space-y-3" onSubmit={submitAuth}>
              {mode === 'signup' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="position">Job position</Label>
                    <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Sales Lead" />
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={preview.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'signup' ? 'Create account & join' : 'Sign in & join'}
              </Button>
            </form>

            <div className="my-2 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-wider text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button type="button" variant="outline" className="w-full" onClick={continueGoogle}>
              Continue with Google
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
