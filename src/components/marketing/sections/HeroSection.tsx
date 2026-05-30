import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ArrowRight, Play, TrendingUp, Package, BarChart3, Wallet, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { GradientBlobs, GridBackdrop } from '../Background';
import { AnimatedNumber } from '@/components/AnimatedNumber';

const SLIDES = [
  {
    key: 'sales',
    label: 'Sales Tracking',
    icon: TrendingUp,
    accent: 'from-violet-500 to-fuchsia-500',
    title: "Today's Sales",
    metric: 12480,
    sub: '+18% vs yesterday',
    bars: [40, 65, 50, 80, 70, 95, 88],
  },
  {
    key: 'inventory',
    label: 'Inventory Management',
    icon: Package,
    accent: 'from-cyan-400 to-blue-500',
    title: 'Stock Health',
    metric: 248,
    sub: '12 low-stock alerts',
    bars: [85, 70, 60, 45, 30, 50, 65],
  },
  {
    key: 'analytics',
    label: 'Business Analytics',
    icon: BarChart3,
    accent: 'from-emerald-400 to-teal-500',
    title: 'Net Profit',
    metric: 8920,
    sub: 'This month',
    bars: [30, 45, 55, 70, 65, 85, 92],
  },
];

export function HeroSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((v) => (v + 1) % SLIDES.length), 4500);
    return () => clearInterval(t);
  }, []);

  const slide = SLIDES[active];
  const Icon = slide.icon;

  return (
    <section className="relative pt-16 pb-24 sm:pt-24 sm:pb-32">
      <GradientBlobs />
      <GridBackdrop />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
        {/* Left */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur px-3.5 py-1.5 text-xs text-white/80 mb-6"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Built for African businesses
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.05]"
          >
            Track Sales.{' '}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
              Control Stock.
            </span>
            <br />
            Know Your Money.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="mt-6 text-base sm:text-lg text-white/70 max-w-xl leading-relaxed"
          >
            KudiTrack helps businesses manage sales, inventory, expenses, profit, and cash flow in
            one smart platform. Built mobile-first for shops, salons, distributors, and teams.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button
              asChild
              className="h-12 px-7 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 text-black font-semibold hover:opacity-90 shadow-[0_0_40px_-5px_rgba(139,92,246,0.7)]"
            >
              <Link to="/sign-up">
                Start Free <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 px-7 rounded-full bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white backdrop-blur"
            >
              <a href="#dashboard">
                <Play className="mr-1.5 h-4 w-4" /> Watch Demo
              </a>
            </Button>
          </motion.div>

          {/* Mini stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="mt-12 grid grid-cols-3 gap-4 max-w-md"
          >
            {[
              { v: 2500, suf: '+', label: 'Businesses' },
              { v: 1.2, suf: 'M+', label: 'Sales tracked', dec: true },
              { v: 99.9, suf: '%', label: 'Uptime', dec: true },
            ].map((s) => (
              <div key={s.label} className="text-left">
                <div className="text-2xl sm:text-3xl font-bold">
                  <AnimatedNumber
                    value={s.v}
                    formatter={(n) => `${s.dec ? n.toFixed(1) : Math.round(n)}${s.suf}`}
                  />
                </div>
                <div className="text-xs text-white/60 mt-1">{s.label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right — Showcase carousel */}
        <div className="relative h-[460px] sm:h-[520px]">
          {/* Floating side cards */}
          <FloatingCard
            className="absolute -left-2 top-12 z-10 hidden sm:block"
            delay={0.6}
            icon={<Wallet className="h-4 w-4 text-emerald-300" />}
            label="Cash on hand"
            value="GHS 24,300"
            accent="from-emerald-500/30 to-teal-500/10"
          />
          <FloatingCard
            className="absolute -right-2 bottom-16 z-10 hidden sm:block"
            delay={0.9}
            icon={<AlertCircle className="h-4 w-4 text-amber-300" />}
            label="Low stock"
            value="12 items"
            accent="from-amber-500/30 to-orange-500/10"
          />

          {/* Main glass card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="relative h-full rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl p-6 sm:p-8 shadow-[0_30px_120px_-30px_rgba(139,92,246,0.4)] overflow-hidden"
          >
            {/* glow ring */}
            <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5 pointer-events-none" />
            <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full bg-gradient-to-br ${slide.accent} opacity-30 blur-3xl`} />

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${slide.accent} flex items-center justify-center shadow-lg`}>
                  <Icon className="h-4 w-4 text-black" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/50">Live preview</p>
                  <p className="text-sm font-semibold">{slide.label}</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {SLIDES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-white' : 'w-1.5 bg-white/30'}`}
                    aria-label={`Slide ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={slide.key}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.4 }}
              >
                <p className="text-xs text-white/60">{slide.title}</p>
                <p className="text-4xl sm:text-5xl font-bold mt-1">
                  <AnimatedNumber
                    value={slide.metric}
                    formatter={(n) => slide.key === 'inventory'
                      ? `${Math.round(n)}`
                      : `GHS ${Math.round(n).toLocaleString()}`}
                  />
                </p>
                <p className="text-xs text-emerald-300 mt-1">{slide.sub}</p>

                {/* Mock chart */}
                <div className="mt-8 h-40 flex items-end gap-2">
                  {slide.bars.map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ delay: i * 0.05, duration: 0.6, ease: 'easeOut' }}
                      className={`flex-1 rounded-md bg-gradient-to-t ${slide.accent} opacity-90`}
                    />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-white/40">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>

                {/* Mini rows */}
                <div className="mt-6 space-y-2">
                  {[
                    { name: 'Bag of Rice 50kg', val: 'GHS 480' },
                    { name: 'Coca-Cola Crate', val: 'GHS 120' },
                    { name: 'Sugar 1kg', val: 'GHS 18' },
                  ].map((r, i) => (
                    <motion.div
                      key={r.name}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.07 }}
                      className="flex items-center justify-between text-xs rounded-lg bg-white/[0.04] border border-white/5 px-3 py-2"
                    >
                      <span className="text-white/80">{r.name}</span>
                      <span className="text-white font-semibold">{r.val}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FloatingCard({
  className = '',
  delay = 0,
  icon,
  label,
  value,
  accent,
}: {
  className?: string;
  delay?: number;
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: [0, -10, 0] }}
      transition={{
        opacity: { duration: 0.6, delay },
        y: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay },
      }}
      className={`rounded-2xl border border-white/15 bg-gradient-to-br ${accent} backdrop-blur-xl px-4 py-3 shadow-xl ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/60">{label}</p>
          <p className="text-sm font-bold text-white">{value}</p>
        </div>
      </div>
    </motion.div>
  );
}
