import { useState } from 'react';
import { Mail, ShieldCheck, ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function EmailVerificationCard() {
  const { user, emailVerified } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const resend = async () => {
    if (!user?.email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (error) throw error;
      toast({ title: 'Verification email sent', description: `Check ${user.email}.` });
    } catch (err) {
      toast({
        title: 'Could not send email',
        description: err instanceof Error ? err.message : 'Try again shortly.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email Verification
          {emailVerified ? (
            <Badge variant="default" className="ml-2 gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
          ) : (
            <Badge variant="destructive" className="ml-2 gap-1"><ShieldAlert className="h-3 w-3" /> Unverified</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Email</span>
          <span className="font-medium">{user?.email}</span>
        </div>
        {emailVerified ? (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle2 className="h-3 w-3 text-primary" />
              <span>Your email address is confirmed.</span>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              We sent a confirmation link to your inbox. Without it some features may be limited.
            </p>
            <Button size="sm" onClick={resend} disabled={sending}>
              {sending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Resend verification email
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
