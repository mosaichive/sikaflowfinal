import { useState } from 'react';
import { Mail, X, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'kuditrack:email-verify-dismissed';

export function EmailVerifyBanner() {
  const { user, emailVerified } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  });

  if (!user || emailVerified || dismissed) return null;

  const resend = async () => {
    if (!user.email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
      });
      if (error) throw error;
      toast({ title: 'Verification email sent', description: `Check ${user.email} for the link.` });
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

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Mail className="h-4 w-4 text-amber-500" />
          <span className="font-medium text-foreground">Verify your email</span>
          <span className="hidden text-muted-foreground sm:inline">
            We sent a confirmation link to {user.email}.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={resend} disabled={sending}>
            {sending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-2 h-3 w-3" />}
            Resend link
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
