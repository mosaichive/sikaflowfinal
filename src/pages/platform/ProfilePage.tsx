import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, ShieldCheck, ShieldAlert, UserCircle2, Clock, KeyRound, Send } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);
  const [pwError, setPwError] = useState('');

  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setLastSignInAt((u.user as any)?.last_sign_in_at ?? null);
      const { data: f } = await supabase.auth.mfa.listFactors();
      const verified = (f?.totp ?? []).some((x: any) => x.status === 'verified');
      setMfaEnabled(verified);
    })();
  }, []);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    setChanging(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated', description: 'Your password has been changed.' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err?.message ?? 'Could not update password.');
    } finally {
      setChanging(false);
    }
  };

  const sendResetEmail = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: 'Reset email sent', description: `Check ${user.email} for the reset link.` });
    } catch (err: any) {
      toast({ title: 'Could not send reset email', description: err?.message, variant: 'destructive' });
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserCircle2 className="h-6 w-6 text-primary" /> Super Admin Profile
        </h1>
        <p className="text-sm text-muted-foreground">Manage your platform admin account.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Role</p>
              <Badge variant="secondary">Super Admin</Badge>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {mfaEnabled ? <ShieldCheck className="h-4 w-4 text-primary" /> : <ShieldAlert className="h-4 w-4 text-amber-500" />}
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">MFA status</p>
              <p className="font-medium">
                {mfaEnabled === null ? 'Checking…' : mfaEnabled ? 'Enabled (TOTP)' : 'Not enrolled'}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/super-admin/security">Manage MFA</Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Last sign-in</p>
              <p className="font-medium">{lastSignInAt ? new Date(lastSignInAt).toLocaleString() : '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            {pwError && (
              <Alert variant="destructive"><AlertDescription>{pwError}</AlertDescription></Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-pw">New password</Label>
              <PasswordInput
                id="new-pw"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <PasswordInput
                id="confirm-pw"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" disabled={changing}>
              {changing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" /> Reset password by email
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Send a secure password reset link to your email address.
          </p>
          <Button variant="outline" onClick={sendResetEmail} disabled={sendingReset}>
            {sendingReset && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send reset link
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
