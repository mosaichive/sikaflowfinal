import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { SectionHeader } from './FeaturesSection';

const PLANS = [
  {
    name: 'Free',
    desc: 'Get started and try the basics',
    monthly: 0,
    annual: 0,
    features: ['Up to 50 sales / month', 'Basic inventory', '1 user', 'Mobile + web access'],
    cta: 'Start Free',
    href: '/sign-up',
    highlight: false,
  },
  {
    name: 'Basic',
    desc: 'For growing single-shop businesses',
    monthly: 49,
    annual: 39,
    features: ['Unlimited sales', 'Full inventory + alerts', 'Up to 3 staff', 'Expense tracking', 'Profit reports', 'WhatsApp report sharing'],
    cta: 'Get Basic',
    href: '/sign-up',
    highlight: true,
  },
  {
    name: 'Pro',
    desc: 'For multi-shop & teams',
    monthly: 99,
    annual: 79,
    features: ['Everything in Basic', 'Multiple shops', 'Unlimited staff with roles', 'Advanced analytics', 'Priority support', 'Custom branding'],
    cta: 'Get Pro',
    href: '/sign-up',
    highlight: false,
  },
];

export function PricingSection() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="Pricing"
          title="Simple, honest pricing"
          sub="Pay only for what you need. Cancel anytime. Includes secure Paystack payments."
        />

        {/* Toggle */}
        <div className="mt-10 flex justify-center">
          <div className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-1 backdrop-blur">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 text-sm rounded-full transition ${!annual ? 'bg-white text-black font-semibold' : 'text-white/70'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 text-sm rounded-full transition ${annual ? 'bg-white text-black font-semibold' : 'text-white/70'}`}
            >
              Annual <span className="ml-1.5 text-[10px] text-emerald-500">−20%</span>
            </button>
          </div>
        </div>

        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {PLANS.map((p, i) => {
            const price = annual ? p.annual : p.monthly;
            return (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className={`relative rounded-3xl p-7 backdrop-blur-xl ${
                  p.highlight
                    ? 'border border-[rgba(81,193,31,0.4)] bg-gradient-to-br from-[#51C11F]/18 via-[#45A91A]/10 to-cyan-400/8 shadow-[0_8px_24px_rgba(81,193,31,0.12)]'
                    : 'border border-white/10 bg-white/[0.03]'
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#51C11F] to-[#45A91A] text-white text-[10px] font-bold px-3 py-1 uppercase tracking-widest">
                    <Sparkles className="h-3 w-3" /> Most popular
                  </div>
                )}
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-white/55 mt-1">{p.desc}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{price === 0 ? 'Free' : `GHS ${price}`}</span>
                  {price > 0 && <span className="text-xs text-white/55">/mo</span>}
                </div>
                {annual && price > 0 && (
                  <p className="text-[11px] text-emerald-300 mt-1">Billed annually</p>
                )}

                <Button
                  asChild
                  className={`mt-6 w-full rounded-full h-11 ${
                    p.highlight
                      ? 'bg-gradient-to-r from-[#51C11F] to-[#45A91A] text-white font-semibold hover:opacity-90'
                      : 'bg-white/10 text-white hover:bg-white/15 border border-white/15'
                  }`}
                >
                  <Link to={p.href}>{p.cta}</Link>
                </Button>

                <ul className="mt-6 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-white/80">
                      <Check className="h-4 w-4 text-emerald-300 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
