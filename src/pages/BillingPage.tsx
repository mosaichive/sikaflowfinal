import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useSubscription, PLAN_LABELS, STATUS_LABELS } from '@/context/SubscriptionContext';
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
import { TIER_FALLBACK_PRICES, type PlanTier } from '@/lib/plan-features';
import {
  AlertTriangle,
  Building2,
  Check,
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
  plan: string;
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

type PricingRow = {
  tier: PlanTier;
  name: string;
  description: string;
  price_monthly: number;
  price_annual: number;
  features: string[];
  cta_label: string;
  is_popular: boolean;
};

const DEFAULT_PRICING: PricingRow[] = [
  { tier: 'starter', name: 'Starter', description: 'Everything a solo shop owner needs.', price_monthly: TIER_FALLBACK_PRICES.starter.monthly, price_annual: TIER_FALLBACK_PRICES.starter.annual,
    features: ['Sales', 'Inventory', 'Expenses', 'Customers', 'Basic Reports', '1 Business', 'Up to 2 Staff'],
    cta_label: 'Get Started', is_popular: false },
  { tier: 'business', name: 'Business', description: 'For growing teams that need SMS & advanced reports.', price_monthly: TIER_FALLBACK_PRICES.business.monthly, price_annual: TIER_FALLBACK_PRICES.business.annual,
    features: ['Everything in Starter', 'Unlimited Staff', 'Advanced Reports', 'SMS Notifications', 'Team Management', 'Business Insights', 'Export Reports'],
    cta_label: 'Choose Business', is_popular: true },
  { tier: 'business_plus', name: 'Business Plus', description: 'Full commerce with online ordering and delivery.', price_monthly: TIER_FALLBACK_PRICES.business_plus.monthly, price_annual: TIER_FALLBACK_PRICES.business_plus.annual,
    features: ['Everything in Business', 'Online Ordering', 'Store Link', 'Order Tracking', 'Delivery Updates', 'Paystack Checkout', 'Delivery Fee', 'Carrier Info', 'Delivery Confirmation'],
    cta_label: 'Go Premium', is_popular: false },
];

export default function BillingPage() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const { subscription, hasAccess, daysRemaining, refresh, isLegacy } = useSubscription();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [pricing, setPricing] = useState<PricingRow[]>(DEFAULT_PRICING);
  const [payOpen, setPayOpen] = useState<{ tier: PlanTier; cycle: 'monthly' | 'annual'; amount: number; method: PaymentMethod } | null>(null);
  const [reference, setReference] = useState('');
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [paystackBusy, setPaystackBusy] = useState<string | null>(null);
  const [refundAccepted, setRefundAccepted] = useState(false);
  const [refundAcceptedAt, setRefundAcceptedAt] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [cycle, setCycle] = useState<'monthly' | 'annual'>('annual');
  const [selectedTier, setSelectedTier] = useState<PlanTier>('business');

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

  const loadPricing = useCallback(async () => {
    const { data } = await supabase
      .from('pricing_plans' as any)
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (data && data.length) {
      setPricing((data as any[]).map((r) => ({
        tier: r.tier as PlanTier,
        name: r.name,
        description: r.description,
        price_monthly: Number(r.price_monthly),
        price_annual: Number(r.price_annual),
        features: Array.isArray(r.features) ? r.features : [],
        cta_label: r.cta_label,
        is_popular: !!r.is_popular,
      })));
    }
  }, []);

  useEffect(() => { void loadPayments(); }, [loadPayments]);
  useEffect(() => { void loadMethods(); }, [loadMethods]);
  useEffect(() => { void loadPricing(); }, [loadPricing]);

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

  useEffect(() => {
    const ref = params.get('reference') || params.get('trxref');
    if (!ref) return;
    let cancelled = false;
    setVerifying(true);
    const verifyOnce = async (): Promise<string> => {
      const { data, error } = await supabase.functions.invoke('paystack-verify', { body: { reference: ref } });
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
      if (status === 'confirmed') toast({ title: 'Payment confirmed', description: 'Your subscription is active now.' });
      else if (status === 'review') toast({ title: 'Payment under review', description: 'We received the payment but flagged it for admin review.' });
      else if (status === 'failed') toast({ title: 'Payment failed', description: 'Please try again or use another method.', variant: 'destructive' });
      else toast({ title: 'Still verifying', description: 'Paystack has not finalised this payment yet. We will update automatically.' });
      const next = new URLSearchParams(params);
      next.delete('reference'); next.delete('trxref');
      setParams(next, { replace: true });
      setVerifying(false);
      await loadPayments();
      await refresh();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceFor = (tier: PlanTier) => {
    const row = pricing.find((r) => r.tier === tier);
    if (!row) return 0;
    return cycle === 'annual' ? row.price_annual : row.price_monthly;
  };

  const submitManualPayment = async () => {
    if (!payOpen || !user) return;
    if (!reference) return toast({ title: 'Reference required', description: 'Enter the transaction reference.', variant: 'destructive' });
    if (!refundAccepted || !refundAcceptedAt) return toast({ title: 'Refund Policy required', description: 'Please read and agree to the Refund Policy before paying.', variant: 'destructive' });

    setBusy(true);
    const { error } = await supabase.from('subscription_payments').insert({
      user_id: user.id,
      plan: payOpen.tier as any,
      amount: payOpen.amount,
      payment_method: payOpen.method.kind === 'momo' ? 'manual_momo' : 'bank_transfer',
      status: 'pending',
      reference,
      note: [
        payOpen.method.label,
        `${payOpen.tier} · ${payOpen.cycle}`,
        payerName ? `Payer: ${payerName}` : null,
        payerPhone ? `Phone: ${payerPhone}` : null,
        `Refund Policy accepted: ${refundAcceptedAt}`,
        note,
      ].filter(Boolean).join(' — '),
    });
    setBusy(false);
    if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Payment submitted', description: 'KudiTrack can now review and activate your plan.' });
    setPayOpen(null); setReference(''); setNote(''); setPayerName(''); setPayerPhone('');
    await loadPayments();
  };

  const startPaystack = async (tier: PlanTier) => {
    if (!refundAccepted || !refundAcceptedAt) return toast({ title: 'Refund Policy required', description: 'Please read and agree to the Refund Policy before paying.', variant: 'destructive' });
    setPaystackBusy(tier);
    const callback_url = `${window.location.origin}/billing`;
    const { data, error } = await supabase.functions.invoke('paystack-init', {
      body: { plan: tier, cycle, callback_url },
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

  const copy = (text: string) => { navigator.clipboard.writeText(text); toast({ title: 'Copied' }); };

  const status = subscription?.status ?? 'trial';
  const showWarning = !hasAccess;
  const momoMethods = useMemo(() => methods.filter((m) => m.kind === 'momo'), [methods]);
  const bankMethods = useMemo(() => methods.filter((m) => m.kind === 'bank'), [methods]);
  const selectedAmount = priceFor(selectedTier);

  return (
    <AppLayout>
      <div className="max-w-6xl space-y-6">
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
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-2xl font-bold">{PLAN_LABELS[subscription?.plan ?? 'free_trial']}</p>
              <Badge variant={status === 'active' || status === 'lifetime' ? 'default' : status === 'trial' ? 'secondary' : 'destructive'}>
                {STATUS_LABELS[status]}
              </Badge>
              {isLegacy && subscription?.plan !== 'free_trial' && subscription?.plan !== 'trial' && (
                <Badge variant="outline" className="text-[10px]">Legacy plan — all features included</Badge>
              )}
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
            {/* Cycle toggle */}
            <div className="flex items-center justify-center">
              <div className="inline-flex rounded-full border p-1 bg-muted/50">
                <button
                  onClick={() => setCycle('monthly')}
                  className={cn('px-5 py-1.5 text-xs rounded-full transition', cycle === 'monthly' ? 'bg-background shadow font-semibold' : 'text-muted-foreground')}
                >Monthly</button>
                <button
                  onClick={() => setCycle('annual')}
                  className={cn('px-5 py-1.5 text-xs rounded-full transition', cycle === 'annual' ? 'bg-background shadow font-semibold' : 'text-muted-foreground')}
                >Annual <span className="ml-1 text-emerald-600 dark:text-emerald-400">Save ~17%</span></button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {pricing.map((p) => (
                <TierCard
                  key={p.tier}
                  plan={p}
                  cycle={cycle}
                  selected={selectedTier === p.tier}
                  onSelect={() => setSelectedTier(p.tier)}
                  isCurrent={subscription?.plan === p.tier && status === 'active'}
                />
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Methods</CardTitle>
                <CardDescription>
                  Pay <span className="font-semibold text-foreground">GH₵{selectedAmount}</span> for the {pricing.find((p) => p.tier === selectedTier)?.name} plan ({cycle}).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <label
                  htmlFor="refund-policy-accept"
                  className={cn('flex items-start gap-3 rounded-lg border p-3 transition-colors cursor-pointer',
                    refundAccepted ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30 hover:border-primary/30')}
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
                      <Link to="/refund-policy" target="_blank" rel="noopener" className="text-primary hover:underline">Refund Policy</Link>.
                    </p>
                    {refundAccepted && refundAcceptedAt && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Accepted {new Date(refundAcceptedAt).toLocaleString()}</p>
                    )}
                  </div>
                </label>

                <Section icon={Globe} title="Paystack Checkout" description="Card, Mobile Money, or bank — handled securely by Paystack. Your plan activates automatically.">
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
                    <Button onClick={() => startPaystack(selectedTier)} disabled={paystackBusy !== null || verifying || !refundAccepted}>
                      {paystackBusy === selectedTier
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Redirecting…</>
                        : verifying
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</>
                          : `Pay GH₵${selectedAmount} now`}
                    </Button>
                  </div>
                </Section>

                {momoMethods.length > 0 && (
                  <Section icon={Smartphone} title="Manual Mobile Money" description="Send the exact amount and submit the reference for admin review.">
                    <div className="grid gap-2">
                      {momoMethods.map((method) => (
                        <MethodRow
                          key={method.id}
                          m={method}
                          amount={selectedAmount}
                          onCopy={copy}
                          onPay={() => setPayOpen({ tier: selectedTier, cycle, amount: selectedAmount, method })}
                        />
                      ))}
                    </div>
                  </Section>
                )}

                {bankMethods.length > 0 && (
                  <Section icon={Building2} title="Bank Transfer" description="Transfer the exact amount and submit the reference for admin review.">
                    <div className="grid gap-2">
                      {bankMethods.map((method) => (
                        <MethodRow
                          key={method.id}
                          m={method}
                          amount={selectedAmount}
                          onCopy={copy}
                          onPay={() => setPayOpen({ tier: selectedTier, cycle, amount: selectedAmount, method })}
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
                  const planLabel = PLAN_LABELS[payment.plan as any] ?? payment.plan;
                  return (
                    <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{planLabel} — GH₵{paidAmount.toLocaleString()}</p>
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
            <DialogTitle>Submit payment for {payOpen ? pricing.find((p) => p.tier === payOpen.tier)?.name : ''} ({payOpen?.cycle})</DialogTitle>
            <DialogDescription>
              {payOpen && `Sent GH₵${payOpen.amount} via ${payOpen.method.label}? Submit the reference here so KudiTrack can verify it.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Transaction reference *</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MM240417xxxxx" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Payer name</Label>
                <Input value={payerName} onChange={(e) => setPayerName(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Payer phone</Label>
                <Input value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
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

function TierCard({
  plan, cycle, selected, onSelect, isCurrent,
}: {
  plan: PricingRow;
  cycle: 'monthly' | 'annual';
  selected: boolean;
  onSelect: () => void;
  isCurrent: boolean;
}) {
  const price = cycle === 'annual' ? plan.price_annual : plan.price_monthly;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative text-left rounded-2xl border-2 p-5 transition-all flex flex-col',
        selected ? 'border-primary bg-primary/5 shadow-md' : 'border-border hover:border-primary/40 bg-card',
        plan.is_popular && !selected && 'border-primary/40',
      )}
    >
      {plan.is_popular && (
        <div className="absolute -top-2.5 right-4 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
          <Sparkles className="h-2.5 w-2.5" /> POPULAR
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">{plan.name}</h3>
        {isCurrent && <Badge variant="secondary" className="text-[10px]">Current</Badge>}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1 min-h-[32px]">{plan.description}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold">GH₵{price}</span>
        <span className="text-[11px] text-muted-foreground">/{cycle === 'annual' ? 'yr' : 'mo'}</span>
      </div>
      <ul className="mt-4 space-y-1.5 flex-1">
        {plan.features.slice(0, 6).map((f) => (
          <li key={f} className="text-[11px] flex items-start gap-1.5">
            <Check className="h-3 w-3 text-primary mt-0.5 shrink-0" /> <span>{f}</span>
          </li>
        ))}
        {plan.features.length > 6 && (
          <li className="text-[11px] text-muted-foreground pl-4">+ {plan.features.length - 6} more</li>
        )}
      </ul>
    </button>
  );
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Smartphone; title: string; description?: string; children: ReactNode; }) {
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
  const variant = normalized === 'confirmed' || normalized === 'approved' ? 'default'
    : normalized === 'pending' ? 'secondary'
    : normalized === 'review' ? 'outline' : 'destructive';
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

function MethodRow({ m, amount, onCopy, onPay }: { m: PaymentMethod; amount: number; onCopy: (text: string) => void; onPay: () => void; }) {
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
