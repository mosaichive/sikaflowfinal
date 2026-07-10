import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Check, Sparkles, ShieldCheck, HelpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { TIER_FALLBACK_PRICES, type PlanTier } from '@/lib/plan-features';

type PricingRow = {
  id: string;
  tier: PlanTier;
  name: string;
  description: string;
  price_monthly: number;
  price_annual: number;
  features: string[];
  cta_label: string;
  is_popular: boolean;
  sort_order: number;
};

const DEFAULT_ROWS: PricingRow[] = [
  { id: 's', tier: 'starter', name: 'Starter', description: 'Everything a solo shop owner needs to run day-to-day sales.',
    price_monthly: TIER_FALLBACK_PRICES.starter.monthly, price_annual: TIER_FALLBACK_PRICES.starter.annual,
    features: ['Sales', 'Inventory', 'Expenses', 'Customers', 'Basic Reports', '1 Business', 'Up to 2 Staff'],
    cta_label: 'Get Started', is_popular: false, sort_order: 10 },
  { id: 'b', tier: 'business', name: 'Business', description: 'For growing teams that need advanced reports and SMS.',
    price_monthly: TIER_FALLBACK_PRICES.business.monthly, price_annual: TIER_FALLBACK_PRICES.business.annual,
    features: ['Everything in Starter', 'Unlimited Staff', 'Advanced Reports', 'SMS Notifications', 'Team Management', 'Business Insights', 'Export Reports'],
    cta_label: 'Choose Business', is_popular: true, sort_order: 20 },
  { id: 'bp', tier: 'business_plus', name: 'Business Plus', description: 'The full commerce suite with online ordering and delivery.',
    price_monthly: TIER_FALLBACK_PRICES.business_plus.monthly, price_annual: TIER_FALLBACK_PRICES.business_plus.annual,
    features: ['Everything in Business', 'Online Ordering', 'Customer Store Link', 'Customer Order Tracking', 'Delivery Status Updates', 'Automatic Customer SMS', 'Paystack Checkout', 'Delivery Fee', 'Carrier Information', 'Customer Delivery Confirmation'],
    cta_label: 'Go Premium', is_popular: false, sort_order: 30 },
];

const FAQS = [
  { q: 'Can I change my plan later?', a: 'Yes. You can upgrade at any time from your Billing page. When you upgrade the new features unlock instantly.' },
  { q: 'What happens after my 30-day free trial?', a: 'Your account switches to read-only until you pick a paid plan. Your data is never deleted — pick a plan any time to resume writing.' },
  { q: 'Do I need a card to start the trial?', a: 'No. You get 30 days free with no card required. Choose Starter, Business, or Business Plus whenever you\'re ready.' },
  { q: 'How does annual billing save me money?', a: 'Annual plans give you roughly 2 months free compared to paying monthly, and lock in the price for 12 months.' },
  { q: 'What payment methods do you accept?', a: 'All plans support Mobile Money, Card, and Bank transfer via Paystack. Manual Mobile Money and Bank transfer are also available.' },
  { q: 'Can I get a refund?', a: 'Yes — our Refund Policy covers billing errors and unauthorised charges. Read the full Refund Policy for details.' },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(true);
  const [rows, setRows] = useState<PricingRow[]>(DEFAULT_ROWS);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('pricing_plans' as any)
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (data && data.length) {
        setRows((data as any[]).map((r) => ({
          ...r,
          features: Array.isArray(r.features) ? r.features : [],
        })));
      }
    })();
  }, []);

  return (
    <div className="relative">
      {/* Hero */}
      <section className="pt-16 pb-10 sm:pt-24 sm:pb-16">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/70"
          >
            <Sparkles className="h-3 w-3" /> Pricing
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-4 text-4xl sm:text-6xl font-bold tracking-tight"
          >
            Simple pricing.<br className="hidden sm:block" /> Serious value.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-2xl text-lg text-white/60"
          >
            Choose the plan that fits your business. Start with a 30-day free trial — no card required.
          </motion.p>

          {/* Toggle */}
          <div className="mt-10 flex justify-center">
            <div className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1 backdrop-blur">
              <button
                onClick={() => setAnnual(false)}
                className={`px-6 py-2 text-sm rounded-full transition ${!annual ? 'bg-white text-black font-semibold' : 'text-white/70'}`}
              >Monthly</button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-6 py-2 text-sm rounded-full transition ${annual ? 'bg-white text-black font-semibold' : 'text-white/70'}`}
              >Annual <span className="ml-1.5 text-[10px] text-emerald-300">Save ~17%</span></button>
            </div>
          </div>
        </div>
      </section>

      {/* Plan cards */}
      <section className="pb-20">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 grid md:grid-cols-3 gap-6">
          {rows.map((p, i) => {
            const price = annual ? p.price_annual : p.price_monthly;
            const monthlyEq = annual ? Math.round((p.price_annual / 12) * 10) / 10 : null;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className={`relative rounded-3xl p-8 backdrop-blur-xl flex flex-col ${
                  p.is_popular
                    ? 'border-2 border-[rgba(44,134,3,0.55)] bg-gradient-to-br from-[#2C8603]/20 via-[#2C8603]/8 to-cyan-400/8 shadow-[0_10px_40px_rgba(44,134,3,0.18)]'
                    : 'border border-white/10 bg-white/[0.03]'
                }`}
              >
                {p.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#2C8603] to-[#2C8603] text-white text-[10px] font-bold px-3 py-1 uppercase tracking-widest">
                    <Sparkles className="h-3 w-3" /> Most popular
                  </div>
                )}
                <p className="text-xl font-bold">{p.name}</p>
                <p className="text-sm text-white/55 mt-1.5 min-h-[40px]">{p.description}</p>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-5xl font-bold">GHS {price}</span>
                  <span className="text-sm text-white/55">/{annual ? 'year' : 'month'}</span>
                </div>
                {monthlyEq !== null && (
                  <p className="text-[11px] text-emerald-300 mt-1.5">Just GHS {monthlyEq}/month, billed annually</p>
                )}
                {!annual && (
                  <p className="text-[11px] text-white/40 mt-1.5">Billed monthly · cancel anytime</p>
                )}

                <Button
                  asChild
                  className={`mt-6 w-full rounded-full h-12 ${
                    p.is_popular
                      ? 'bg-[#ffcc00] text-slate-950 font-bold hover:bg-[#f1bd00]'
                      : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'
                  }`}
                >
                  <Link to="/sign-up">{p.cta_label}</Link>
                </Button>

                <ul className="mt-7 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-white/85">
                      <Check className="h-4 w-4 text-emerald-300 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        {/* Secure notice */}
        <div className="mt-10 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            Secure payment powered by Paystack — Card · Mobile Money · Bank
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-24">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-10">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white/70">
              <HelpCircle className="h-3 w-3" /> FAQ
            </p>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold">Questions? Answered.</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={i} value={`i-${i}`} className="border-white/10">
                <AccordionTrigger className="text-left text-white hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-white/70 text-sm leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Contact sales */}
      <section className="pb-24">
        <div className="max-w-4xl mx-auto px-5 sm:px-8">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-8 sm:p-12 text-center">
            <h3 className="text-2xl sm:text-3xl font-bold">Running a larger operation?</h3>
            <p className="mt-3 text-white/60">
              Multi-branch, franchises, or custom needs? Our team will build the right plan for you.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild className="rounded-full h-12 px-6 bg-[#ffcc00] text-slate-950 font-bold hover:bg-[#f1bd00]">
                <Link to="/#contact">Contact Sales</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full h-12 px-6 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                <Link to="/sign-up">Start free trial</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
