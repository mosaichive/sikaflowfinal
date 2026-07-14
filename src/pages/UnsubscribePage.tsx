import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/Logo';
import { CheckCircle2, MailX } from 'lucide-react';

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('e') ?? '');
  const campaignId = params.get('c') ?? '';
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email) return;
    setState('loading');
    setError(null);
    try {
      const url = `${(import.meta as any).env?.VITE_SUPABASE_URL ?? ''}/functions/v1/email-unsubscribe?e=${encodeURIComponent(email)}${campaignId ? `&c=${campaignId}` : ''}`;
      const resp = await fetch(url, { method: 'POST' });
      if (!resp.ok) throw new Error((await resp.json()).error ?? 'Failed');
      setState('done');
    } catch (e) {
      setState('error');
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (email && params.get('auto') === '1') void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10" />
          <div>
            <h1 className="text-lg font-bold">KudiTrack</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Email preferences</p>
          </div>
        </div>

        {state === 'done' ? (
          <div className="text-center space-y-3 py-4">
            <CheckCircle2 className="h-12 w-12 mx-auto text-primary" />
            <h2 className="text-xl font-semibold">You're unsubscribed</h2>
            <p className="text-sm text-muted-foreground">
              {email} will no longer receive marketing newsletters. You'll still receive essential
              transactional emails such as OTPs, password resets, payment receipts, subscription
              notifications, security alerts, and order updates.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <MailX className="h-5 w-5 mt-1 text-muted-foreground" />
              <div>
                <h2 className="text-xl font-semibold">Unsubscribe from newsletters</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Confirm your email to stop receiving marketing emails. Transactional emails
                  (OTPs, receipts, order notifications) will still be delivered.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button className="w-full" onClick={submit} disabled={!email || state === 'loading'}>
                {state === 'loading' ? 'Unsubscribing…' : 'Unsubscribe'}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
