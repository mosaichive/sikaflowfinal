import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { AlertCircle, BarChart3, ChevronLeft, ChevronRight, PlayCircle, Receipt, TrendingUp, Wallet } from 'lucide-react';
import { SectionHeader } from './FeaturesSection';
import { AnimatedNumber } from '@/components/AnimatedNumber';

const DEMO_SLIDES = [
  { key: 'dashboard', label: 'Dashboard preview', title: 'Dashboard' },
  { key: 'video', label: 'Watch demo', title: 'Demo video' },
] as const;

type DemoSlideKey = (typeof DEMO_SLIDES)[number]['key'];

const getInitialSlide = (): DemoSlideKey => (
  typeof window !== 'undefined' && window.location.hash === '#watch-demo' ? 'video' : 'dashboard'
);

export function DashboardShowcase() {
  const [activeSlide, setActiveSlide] = useState<DemoSlideKey>(getInitialSlide);
  const activeIndex = DEMO_SLIDES.findIndex((slide) => slide.key === activeSlide);
  const active = DEMO_SLIDES[activeIndex] || DEMO_SLIDES[0];

  useEffect(() => {
    const syncSlideFromHash = () => {
      if (window.location.hash === '#watch-demo') {
        setActiveSlide('video');
      } else if (window.location.hash === '#dashboard') {
        setActiveSlide('dashboard');
      }
    };

    syncSlideFromHash();
    window.addEventListener('hashchange', syncSlideFromHash);
    return () => window.removeEventListener('hashchange', syncSlideFromHash);
  }, []);

  const moveSlide = (direction: 1 | -1) => {
    const nextIndex = (activeIndex + direction + DEMO_SLIDES.length) % DEMO_SLIDES.length;
    setActiveSlide(DEMO_SLIDES[nextIndex].key);
  };

  return (
    <section id="dashboard" className="relative py-24 sm:py-32">
      <span id="watch-demo" className="absolute top-0" aria-hidden="true" />
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="Dashboard"
          title="Your business at a glance"
          sub="Designed for the way real African businesses operate — fast, clear, and mobile-first."
        />

        <div className="relative mt-16">
          <div className="absolute inset-x-10 top-10 h-72 bg-gradient-to-r from-[#2C8603]/24 via-[#2C8603]/20 to-cyan-400/24 blur-3xl opacity-60 pointer-events-none" />

          <div className="relative z-10 mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex w-full rounded-2xl border border-white/10 bg-white/[0.05] p-1 backdrop-blur sm:w-auto">
              {DEMO_SLIDES.map((slide) => (
                <button
                  key={slide.key}
                  type="button"
                  onClick={() => setActiveSlide(slide.key)}
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
                    activeSlide === slide.key
                      ? 'bg-white text-black shadow-lg shadow-cyan-500/10'
                      : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                  }`}
                  aria-pressed={activeSlide === slide.key}
                >
                  {slide.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => moveSlide(-1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
                aria-label="Previous demo slide"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveSlide(1)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
                aria-label="Next demo slide"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-5 shadow-[0_8px_24px_rgba(44,134,3,0.12)] sm:p-8"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                </div>
                <span className="ml-3 text-xs text-white/50">app.kuditrack.online</span>
              </div>
              <div className="text-xs text-white/60">{active.title}</div>
            </div>

            <AnimatePresence mode="wait">
              {activeSlide === 'dashboard' ? (
                <DashboardPreview key="dashboard-preview" />
              ) : (
                <VideoPreview key="video-preview" />
              )}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {activeSlide === 'dashboard' ? (
              <MobileMockup key="mobile-mockup" />
            ) : null}
          </AnimatePresence>

          <div className="relative z-10 mt-5 flex justify-center gap-2">
            {DEMO_SLIDES.map((slide) => (
              <button
                key={slide.key}
                type="button"
                onClick={() => setActiveSlide(slide.key)}
                className={`h-2 rounded-full transition-all ${activeSlide === slide.key ? 'w-8 bg-white' : 'w-2 bg-white/30 hover:bg-white/60'}`}
                aria-label={`Show ${slide.label}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.35 }}
    >
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={TrendingUp} label="Daily Sales" value={12480} prefix="GHS " accent="from-[#2C8603]/18 to-[#2C8603]/6" />
        <KpiCard icon={BarChart3} label="Profit" value={3920} prefix="GHS " accent="from-emerald-500/20 to-teal-500/5" />
        <KpiCard icon={Receipt} label="Expenses" value={1640} prefix="GHS " accent="from-[#2C8603]/18 to-[#2C8603]/6" />
        <KpiCard icon={Wallet} label="Business Money" value={24300} prefix="GHS " accent="from-cyan-500/20 to-blue-500/5" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-white/50">Sales — last 7 days</p>
              <p className="mt-1 text-2xl font-bold">
                GHS <AnimatedNumber value={68240} formatter={(n) => Math.round(n).toLocaleString()} />
              </p>
            </div>
            <div className="text-xs text-emerald-300">+24% WoW</div>
          </div>
          <div className="flex h-44 items-end gap-2">
            {[40, 55, 48, 70, 60, 85, 95].map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                whileInView={{ height: `${h}%` }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.6 }}
                className="flex-1 rounded-md bg-gradient-to-t from-[#2C8603] to-[#2C8603] opacity-90"
              />
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-transparent p-5">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-300" />
            <p className="text-sm font-semibold">Low-Stock Alerts</p>
          </div>
          <div className="mt-4 space-y-2.5">
            {[
              { name: 'Indomie 70g', left: 4 },
              { name: 'Sugar 1kg', left: 6 },
              { name: 'Coke 50cl', left: 8 },
            ].map((p) => (
              <div key={p.name} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2.5 text-xs">
                <span className="text-white/80">{p.name}</span>
                <span className="font-semibold text-amber-300">{p.left} left</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function VideoPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.35 }}
      className="mt-6"
    >
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b0f15]/90 shadow-[0_30px_90px_-40px_rgba(34,211,238,0.55)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#2C8603]/10 via-transparent to-cyan-400/10" />
        <video
          className="relative aspect-video w-full bg-[#0b0f15] object-contain"
          src="/kuditrack-ads.mp4"
          poster="/kuditrack-demo-poster.png"
          controls
          playsInline
          preload="metadata"
          aria-label="KudiTrack demo video"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2C8603] to-[#2C8603] text-white">
            <PlayCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">KudiTrack demo</p>
            <p className="text-xs text-white/55">A quick look at how the product works.</p>
          </div>
        </div>
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">Watch demo</p>
      </div>
    </motion.div>
  );
}

function MobileMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40, y: 40 }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 24, y: 24 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="hidden xl:block absolute -right-6 -bottom-10 w-56 rounded-[2rem] border border-white/15 bg-[#0b0f15]/90 p-3 shadow-2xl backdrop-blur"
    >
      <div className="h-72 rounded-[1.4rem] bg-gradient-to-br from-[#2C8603]/28 to-cyan-900/36 p-4">
        <p className="text-[10px] uppercase tracking-widest text-white/50">Mobile</p>
        <p className="mt-1 text-xl font-bold">GHS 1,820</p>
        <p className="text-[10px] text-emerald-300">Today's profit</p>
        <div className="mt-4 space-y-2">
          {[60, 80, 45, 70].map((w, i) => (
            <div key={i} className="h-2 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${w}%` }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                className="h-full bg-gradient-to-r from-[#2C8603] to-[#2C8603]"
              />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function KpiCard({ icon: Icon, label, value, prefix = '', accent }: {
  icon: any; label: string; value: number; prefix?: string; accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${accent} p-4`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-white/60">{label}</p>
        <Icon className="h-4 w-4 text-white/70" />
      </div>
      <p className="mt-2 text-2xl font-bold">
        {prefix}<AnimatedNumber value={value} formatter={(n) => Math.round(n).toLocaleString()} />
      </p>
    </motion.div>
  );
}
