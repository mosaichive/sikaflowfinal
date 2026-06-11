import { useEffect, useState } from 'react';
import { Phone, ShieldCheck, ShieldAlert, Loader2, CheckCircle2, RotateCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getOtpErrorMessage, isValidE164, normalizeGhanaPhone } from '@/lib/phone-otp';

const RESEND_COOLDOWN_SEC = 30;

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function PhoneVerificationCard() {
  const { profilePhone, phoneVerified, phoneVerifiedAt, lastVerifiedPhone, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [phone, setPhone] = useState(profilePhone || '');
  const [step, setStep] = useState<'enter' | 'verify'>('enter');
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setPhone(profilePhone || '');
  }, [profilePhone]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendOtp = async () => {
    setError('');
    const trimmed = phone.trim();
    if (trimmed.length < 9) {
      setError('Enter a valid phone number.');
      return;
    }
    setSending(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-signup-otp', { body: { phone: trimmed } });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: 'Code sent', description: `Check the SMS sent to ${trimmed}.` });
      setStep('verify');
      setCooldown(RESEND_COOLDOWN_SEC);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code.');
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    setError('');
    if (otp.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setVerifying(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('verify-signup-otp', {
        body: { phone: phone.trim(), otp },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: 'Phone verified', description: 'Your number is now confirmed.' });
      setOtp('');
      setStep('enter');
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4" />
          Phone Verification
          {phoneVerified ? (
            <Badge variant="default" className="ml-2 gap-1"><ShieldCheck className="h-3 w-3" /> Verified</Badge>
          ) : (
            <Badge variant="destructive" className="ml-2 gap-1"><ShieldAlert className="h-3 w-3" /> Unverified</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {phoneVerified && lastVerifiedPhone && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <CheckCircle2 className="h-3 w-3 text-primary" />
              <span className="font-medium">Last verified number:</span>
              <span>{lastVerifiedPhone}</span>
            </div>
            {phoneVerifiedAt && <p className="mt-1">Verified on {formatDate(phoneVerifiedAt)}</p>}
          </div>
        )}

        {step === 'enter' ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="phone-verify">Phone number</Label>
              <Input
                id="phone-verify"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0241234567"
              />
              <p className="text-[11px] text-muted-foreground">
                Ghanaian numbers can be entered as 024xxxxxxx — we'll normalize to +233.
              </p>
            </div>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <Button size="sm" onClick={sendOtp} disabled={sending}>
              {sending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {phoneVerified ? 'Update & verify new number' : 'Send verification code'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit code sent to <span className="font-medium text-foreground">{phone}</span>.
            </p>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
            />
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={verifyOtp} disabled={verifying || otp.length !== 6}>
                {verifying && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Verify code
              </Button>
              <Button size="sm" variant="outline" onClick={sendOtp} disabled={sending || cooldown > 0}>
                <RotateCw className="mr-2 h-3 w-3" />
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setStep('enter'); setError(''); setOtp(''); }}>
                Change number
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
