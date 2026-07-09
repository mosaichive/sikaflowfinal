import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription, PLAN_PRICES, PLAN_LABELS, STATUS_LABELS } from '@/context/SubscriptionContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  Globe,
  Loader2,
  Receipt,
  Smartphone,
  Sparkles,
} from 'lucide-react';

type PaymentMethod = {
  id: string;
  kind: 'momo' | 'bank';
  label: string;
  details: Record<string, string>;
  instructions: string | null;
  badge: string | null;
  sort_order: number;
};

type PaymentRow = {
  id: string;
  user_id: string;
  plan: 'monthly' | 'annual';
  amount: number;
  amount_paid: number | null;
  payment_method: string;
  status: string;
  reference: string | null;
  paystack_reference: string | null;
  network: string | null;
  expires_at: string | null;
  note: string | null;
  created_at: string;
};

export default function BillingPage() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const { subscription, hasAccess, daysRemaining, refresh } = useSubscription();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [payOpen, setPayOpen] = useState<{ plan: 'monthly' | 'annual'; method: PaymentMethod } | null>(null);
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [paystackBusy, setPaystackBusy] = useState<'monthly' | 'annual' | null>(null);
  const [refundAccepted, setRefundAccepted] = useState(false);
  const [refundAcceptedAt, setRefundAcceptedAt] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');

  const loadPayments = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('subscription_payments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setPayments(((data as any[]) ?? []) as PaymentRow[]);
  }, [user]);

  const loadMethods = useCallback(async () => {
    const { data } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('active', true)
      .in('type', ['momo', 'bank'])
      .order('type')
      .order('sort_order')
      .order('created_at');
    const mapped: PaymentMethod[] = ((data as any[]) ?? []).map((row) => {
      const details = (row.details ?? {}) as Record<string, any>;
      const { instructions, badge, ...rest } = details;
      return {
        id: row.id,
        kind: row.type as PaymentMethod['kind'],
        label: row.label,
        details: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, String(v ?? '')])),
        instructions: (instructions as string) ?? null,
        badge: (badge as string) ?? null,
        sort_order: row.sort_order ?? 0,
      };
    });
    setMethods(mapped);
  }, []);

  useEffect(() => { void loadPayments(); }, [loadPayments]);
  useEffect(() => { void loadMethods(); }, [loadMethods]);

  // Realtime: any update to my subscription_payments rows
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`billing:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_payments', filter: `user_id=eq.${user.id}` }, () => {
        void loadPayments();
        void refresh();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, loadPayments, refresh]);

  // Handle Paystack callback after redirect
  useEffect(() => {
    const ref = params.get('reference') || params.get('trxref');
    if (!ref) return;

    let cancelled = false;
    setVerifying(true);

    const verifyOnce = async (): Promise<string> => {
      const { data, error } = await supabase.functions.invoke('paystack-verify', {
        body: { reference: ref },
      });
      if (error) return 'pending';
      return ((data as any)?.status as string) ?? 'pending';
    };

    (async () => {
      let status = 'pending';
      for (let i = 0; i < 10 && !cancelled; i += 1) {
        status = await verifyOnce();
        if (status !== 'pending') break;
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (cancelled) return;
      if (status === 'confirmed') {
        toast({ title: 'Payment confirmed', description: 'Your subscription is active now.' });
      } else if (status === 'review') {
        toast({ title: 'Payment under review', description: 'We received the payment but flagged it for admin review.' });
      } else if (status === 'failed') {
        toast({ title: 'Payment failed', description: 'Please try again or use another method.', variant: 'destructive' });
      } else {
        toast({ title: 'Still verifying', description: 'Paystack has not finalised this payment yet. We will update automatically.' });
      }
      const next = new URLSearchParams(params);
      next.delete('reference');
      next.delete('trxref');
      setParams(next, { replace: true });
      setVerifying(false);
      await loadPayments();
      await refresh();
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManualPayment = async () => {
    if (!payOpen || !user) return;
    if (!reference) {
      toast({ title: 'Reference required', description: 'Enter the transaction reference.', variant: 'destructive' });
      return;
    }
    if (!refundAccepted || !refundAcceptedAt) {
      toast({ title: 'Refund Policy required', description: 'Please read and agree to the Refund Policy before paying.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    const amount = PLAN_PRICES[payOpen.plan];
    const { error } = await supabase.from('subscription_payments').insert({
      user_id: user.id,
      plan: payOpen.plan,
      amount,
      payment_method: payOpen.method.kind === 'momo' ? 'manual_momo' : 'bank_transfer',
      status: 'pending',
      reference,
      note: [
        payOpen.method.label,
        payerName ? `Payer: ${payerName}` : null,
        payerPhone ? `Phone: ${payerPhone}` : null,
        `Refund Policy accepted: ${refundAcceptedAt}`,
        note,
      ].filter(Boolean).join(' — '),
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Payment submitted', description: 'KudiTrack can now review and activate your plan.' });
    setPayOpen(null);
    setReference('');
    setNote('');
    setPayerName('');
    setPayerPhone('');
    await loadPayments();
  };

  const startPaystack = async (plan: 'monthly' | 'annual') => {
    if (!refundAccepted || !refundAcceptedAt) {
      toast({ title: 'Refund Policy required', description: 'Please read and agree to the Refund Policy before paying.', variant: 'destructive' });
      return;
    }
    setPaystackBusy(plan);
    const callback_url = `${window.location.origin}/billing`;
    const { data, error } = await supabase.functions.invoke('paystack-init', {
      body: { plan, callback_url },
    });
    setPaystackBusy(null);

    if (error || (data as any)?.error) {
      toast({
        title: 'Could not start Paystack',
        description: (data as any)?.detail?.message || (data as any)?.error || error?.message || 'Please try again.',
        variant: 'destructive',
      });
      return;
    }
    window.location.href = (data as any).authorization_url;
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied' });
  };

  const status = subscription?.status ?? 'trial';
  const showWarning = !hasAccess;
  const momoMethods = useMemo(() => methods.filter((method) => method.kind === 'momo'), [methods]);
  const bankMethods = useMemo(() => methods.filter((method) => method.kind === 'bank'), [methods]);

  return (
    <AppLayout>
      <div className="max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground">{business?.name ?? 'Your business'} · plan, renewals, and payments.</p>
        </div>

        {showWarning && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">Your subscription is {STATUS_LABELS[status]}.</p>
                <p className="text-xs text-muted-foreground">Renew below to restore full access for your team.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><CreditCard className="h-4 w-4" /> Current Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold">{PLAN_LABELS[subscription?.plan ?? 'free_trial']}</p>
              <Badge variant={status === 'active' || status === 'lifetime' ? 'default' : status === 'trial' ? 'secondary' : 'destructive'}>
                {STATUS_LABELS[status]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {status === 'lifetime' && 'Lifetime free access — thank you for being an early customer.'}
              {status === 'trial' && daysRemaining !== null && `${daysRemaining} days left in your free trial.`}
              {status === 'active' && subscription?.current_period_end && `Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}.`}
            </p>
          </CardContent>
        </Card>

        {status !== 'lifetime' && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <PlanCard
                title="Monthly"
                price="GH₵50"
                sub="per month"
                perks={['Full access', 'Cancel anytime', 'Renews every 30 days']}
                selected={selectedPlan === 'monthly'}
                onSelect={() => setSelectedPlan('monthly')}
                current={subscription?.plan === 'monthly' && status === 'active'}
              />
              <PlanCard
                title="Annual"
                badge="Best value"
                price="GH₵500"
                sub="per year"
                perks={['Full access', '1 month free', 'Best value']}
                selected={selectedPlan === 'annual'}
                onSelect={() => setSelectedPlan('annual')}
                current={subscription?.plan === 'annual' && status === 'active'}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Methods</CardTitle>
                <CardDescription>
                  Pay <span className="font-semibold text-foreground">GH₵{PLAN_PRICES[selectedPlan]}</span> for the {selectedPlan} plan.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <label
                  htmlFor="refund-policy-accept"
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer',
                    refundAccepted
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-muted/30 hover:border-primary/30',
                  )}
                >
                  <Checkbox
                    id="refund-policy-accept"
                    checked={refundAccepted}
                    onCheckedChange={(checked) => {
                      const next = checked === true;
                      setRefundAccepted(next);
                      setRefundAcceptedAt(next ? new Date().toISOString() : null);
                    }}
                    className="mt-0.5"
                  />
                  <div className="text-xs leading-relaxed">
                    <p className="font-medium text-foreground">
                      I have read and agree to the{' '}
                      <Link
                        to="/refund-policy"
                        target="_blank"
                        rel="noopener"
                        className="text-primary hover:underline"
                      >
                        Refund Policy
                      </Link>
                      .
                    </p>
                    {refundAccepted && refundAcceptedAt && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Accepted {new Date(refundAcceptedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </label>

                <Section
                  icon={Globe}
                  title="Paystack Checkout"
                  description="Card, Mobile Money, or bank — handled securely by Paystack. Your plan activates automatically."
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">Pay with Paystack</p>
                        <Badge className="text-[10px]">Instant</Badge>
                        <Badge variant="outline" className="text-[10px]">Card · MoMo · Bank</Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        You'll be redirected to Paystack and brought back here once payment completes.
                      </p>
                    </div>
                    <Button onClick={() => startPaystack(selectedPlan)} disabled={paystackBusy !== null || verifying || !refundAccepted}>
                      {paystackBusy === selectedPlan
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting…</>
                        : verifying
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</>
                          : `Pay GH₵${PLAN_PRICES[selectedPlan]} now`}
                    </Button>
                  </div>
                </Section>

                {momoMethods.length > 0 && (
                  <Section
                    icon={Smartphone}
                    title="Manual Mobile Money"
                    description="Send the exact amount and submit the reference for admin review."
                  >
                    <div className="grid gap-2">
                      {momoMethods.map((method) => (
                        <MethodRow
                          key={method.id}
                          m={method}
                          amount={PLAN_PRICES[selectedPlan]}
                          onCopy={copy}
                          onPay={() => setPayOpen({ plan: selectedPlan, method })}
                        />
                      ))}
                    </div>
                  </Section>
                )}

                {bankMethods.length > 0 && (
                  <Section
                    icon={Building2}
                    title="Bank Transfer"
                    description="Transfer the exact amount and submit the reference for admin review."
                  >
                    <div className="grid gap-2">
                      {bankMethods.map((method) => (
                        <MethodRow
                          key={method.id}
                          m={method}
                          amount={PLAN_PRICES[selectedPlan]}
                          onCopy={copy}
                          onPay={() => setPayOpen({ plan: selectedPlan, method })}
                        />
                      ))}
                    </div>
                  </Section>
                )}
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Receipt className="h-4 w-4" /> Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No payments yet.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((payment) => {
                  const paidAmount = Number(payment.amount_paid ?? payment.amount ?? 0);
                  const planLabel = PLAN_LABELS[payment.plan] ?? payment.plan;
                  return (
                    <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {planLabel} — GH₵{paidAmount.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(payment.created_at).toLocaleString()} · {(payment.payment_method ?? '—').replace(/_/g, ' ')} · ref {payment.reference || payment.paystack_reference || '—'}
                        </p>
                        {payment.note && <p className="mt-1 text-[10px] text-muted-foreground">{payment.note}</p>}
                      </div>
                      <StatusBadge status={payment.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!payOpen} onOpenChange={(open) => !open && setPayOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit payment for {payOpen ? PLAN_LABELS[payOpen.plan] : ''}</DialogTitle>
            <DialogDescription>
              {payOpen && `Sent GH₵${PLAN_PRICES[payOpen.plan]} via ${payOpen.method.label}? Submit the reference here so KudiTrack can verify it.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Transaction reference *</Label>
              <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. MM240417xxxxx" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Payer name</Label>
                <Input value={payerName} onChange={(event) => setPayerName(event.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Payer phone</Label>
                <Input value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(null)}>Cancel</Button>
            <Button disabled={busy} onClick={submitManualPayment}>{busy ? 'Submitting...' : 'Submit Payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Smartphone;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = (status ?? '').toLowerCase();
  const variant = normalized === 'confirmed' || normalized === 'approved'
    ? 'default'
    : normalized === 'pending'
      ? 'secondary'
      : normalized === 'review'
        ? 'outline'
        : 'destructive';

  return (
    <Badge
      variant={variant as 'default' | 'secondary' | 'outline' | 'destructive'}
      className={cn('text-[10px]', normalized === 'review' && 'border-amber-500/40 text-amber-600')}
    >
      {(normalized === 'confirmed' || normalized === 'approved') && <CheckCircle2 className="mr-1 h-3 w-3" />}
      {normalized === 'pending' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {normalized}
    </Badge>
  );
}

function MethodRow({
  m,
  amount,
  onCopy,
  onPay,
}: {
  m: PaymentMethod;
  amount: number;
  onCopy: (text: string) => void;
  onPay: () => void;
}) {
  const fields = Object.entries(m.details).filter(([, value]) => value);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{m.label}</p>
          {m.badge && <Badge variant="outline" className="text-[10px]">{m.badge}</Badge>}
        </div>
        <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {fields.map(([key, value]) => (
            <div key={key} className="flex items-center gap-1 text-[11px]">
              <span className="capitalize text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
              <span className="font-mono">{String(value)}</span>
              <button onClick={() => onCopy(String(value))} className="opacity-60 transition hover:opacity-100">
                <Copy className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        {m.instructions && <p className="mt-2 text-[11px] text-muted-foreground">{m.instructions}</p>}
      </div>
      <Button size="sm" onClick={onPay}>I&apos;ve paid GH₵{amount}</Button>
    </div>
  );
}

function PlanCard({
  title,
  price,
  sub,
  perks,
  selected,
  onSelect,
  current,
  badge,
}: {
  title: string;
  price: string;
  sub: string;
  perks: string[];
  selected?: boolean;
  onSelect?: () => void;
  current?: boolean;
  badge?: string;
}) {
  return (
    <Card
      className={cn('cursor-pointer transition-all', selected ? 'border-primary ring-2 ring-primary/30' : current ? 'border-primary' : '')}
      onClick={onSelect}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-1">
            {current && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
            {badge && <Badge variant="default" className="flex items-center gap-1 text-[10px]"><Sparkles className="h-2.5 w-2.5" />{badge}</Badge>}
          </div>
        </div>
        <CardDescription>
          <span className="text-2xl font-bold text-foreground">{price}</span> <span className="text-xs">{sub}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {perks.map((perk) => <li key={perk}>• {perk}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}
