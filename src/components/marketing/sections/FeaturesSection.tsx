import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Package, Receipt, BarChart3, Users, Bell, FileText, Activity, Cloud,
  ArrowRight, CheckCircle2, type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import salesImage from '@/assets/feature-sales.jpg';
import inventoryImage from '@/assets/feature-inventory.jpg';
import growImage from '@/assets/feature-grow.jpg';

type SubFeature = { icon: LucideIcon; label: string };

type Category = {
  eyebrow: string;
  title: string;
  highlight: string;
  subtitle: string;
  image: string;
  gradient: string;
  glow: string;
  accent: string;
  mockup: 'sales' | 'inventory' | 'team';
  features: SubFeature[];
};

const CATEGORIES: Category[] = [
  {
    eyebrow: 'track',
    title: 'Track your',
    highlight: 'sales',
    subtitle: 'Sales, expenses & profit in one view',
    image: salesImage,
    gradient: 'from-violet-500/40 via-fuchsia-500/20 to-transparent',
    glow: 'from-violet-500/60 to-fuchsia-500/30',
    accent: 'bg-violet-500',
    mockup: 'sales',
    features: [
      { icon: TrendingUp, label: 'Sales Tracking' },
      { icon: Receipt, label: 'Expense Tracking' },
      { icon: BarChart3, label: 'Profit Analytics' },
    ],
  },
  {
    eyebrow: 'manage',
    title: 'Manage your',
    highlight: 'inventory',
    subtitle: 'Stock, alerts & real-time monitoring',
    image: inventoryImage,
    gradient: 'from-cyan-500/40 via-emerald-500/20 to-transparent',
    glow: 'from-cyan-500/60 to-emerald-500/30',
    accent: 'bg-cyan-500',
    mockup: 'inventory',
    features: [
      { icon: Package, label: 'Inventory Management' },
      { icon: Bell, label: 'Low Stock Alerts' },
      { icon: Activity, label: 'Real-Time Stock Monitoring' },
    ],
  },
  {
    eyebrow: 'grow',
    title: 'Grow your',
    highlight: 'business',
    subtitle: 'Team, reports & cloud anywhere',
    image: growImage,
    gradient: 'from-pink-500/40 via-rose-500/20 to-transparent',
    glow: 'from-pink-500/60 to-rose-500/30',
    accent: 'bg-pink-500',
    mockup: 'team',
    features: [
      { icon: Users, label: 'Team Management' },
      { icon: FileText, label: 'Business Reports' },
      { icon: Cloud, label: 'Cloud Sync' },
    ],
  },
];

export function FeaturesSection() {
  const navigate = useNavigate();

  return (
    <section id="features" className="relative bg-white py-24 text-slate-950 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-50/70 to-transparent pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="Features"
          title="Everything you need to run a smarter business"
          sub="From the corner shop to a growing distributor — track, decide, and grow without spreadsheets."
          tone="light"
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16">
          {CATEGORIES.map((cat, i) => (
            <motion.article
              key={cat.title}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.6, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              className={`group relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)] transition-all duration-500 hover:-translate-y-2 hover:border-slate-300 hover:shadow-[0_32px_90px_-50px_rgba(15,23,42,0.55)] ${i === 1 ? 'md:col-span-2 lg:col-span-1' : ''}`}
            >
              {/* Ambient gradient glow */}
              <div className={`absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-br ${cat.glow} blur-3xl opacity-20 group-hover:opacity-35 transition-opacity duration-700`} />

              {/* Image block */}
              <div className={`relative m-3 rounded-[20px] overflow-hidden aspect-[4/3] bg-gradient-to-br ${cat.gradient}`}>
                <img
                  src={cat.image}
                  alt={`${cat.title} ${cat.highlight}`}
                  loading="lazy"
                  width={1024}
                  height={768}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                {/* Floating dashboard mockup */}
                <FloatingMockup variant={cat.mockup} />

                {/* Status pill */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/90 backdrop-blur-sm text-[10px] font-semibold text-white shadow-lg"
                >
                  <CheckCircle2 className="h-3 w-3" /> Live
                </motion.div>
              </div>

              {/* Content */}
              <div className="relative p-6 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">{cat.eyebrow}</p>
                <h3 className="text-2xl sm:text-[28px] font-bold leading-tight tracking-tight text-slate-950">
                  {cat.title}{' '}
                  <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-cyan-600 bg-clip-text text-transparent italic">
                    {cat.highlight}
                  </span>
                </h3>
                <p className="mt-2 text-sm text-slate-600">{cat.subtitle}</p>

                <ul className="mt-5 space-y-2.5">
                  {cat.features.map((f) => (
                    <li key={f.label} className="flex items-center gap-3 text-sm text-slate-700">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 transition-colors group-hover:border-slate-300">
                        <f.icon className="h-3.5 w-3.5 text-slate-700" />
                      </span>
                      {f.label}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.article>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-14 flex flex-col items-center gap-3"
        >
          <Button
            onClick={() => navigate('/sign-up')}
            className="bg-gradient-to-r from-violet-500 to-cyan-400 text-black hover:opacity-90 rounded-full px-8 h-12 font-semibold text-base shadow-[0_0_40px_-5px_rgba(139,92,246,0.7)]"
          >
            Start Tracking Today <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
          <p className="text-xs text-slate-500">Free to start • No credit card required</p>
        </motion.div>
      </div>
    </section>
  );
}

function FloatingMockup({ variant }: { variant: 'sales' | 'inventory' | 'team' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 0.5, duration: 0.6 }}
      animate={{ y: [0, -6, 0] }}
      // @ts-expect-error framer typing
      transition_={{ y: { repeat: Infinity, duration: 4, ease: 'easeInOut' } }}
      className="absolute bottom-4 left-4 right-4 sm:right-auto sm:w-[58%] rounded-2xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-2xl p-3 text-[10px] text-slate-800"
    >
      {variant === 'sales' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-900">Today's Sales</span>
            <span className="text-emerald-600 font-semibold">+24%</span>
          </div>
          <div className="text-lg font-bold text-slate-900">GH₵ 12,480</div>
          <div className="mt-2 flex items-end gap-1 h-8">
            {[40, 65, 35, 80, 55, 90, 70].map((h, idx) => (
              <div key={idx} className="flex-1 rounded-sm bg-gradient-to-t from-violet-400 to-fuchsia-400" style={{ height: `${h}%` }} />
            ))}
          </div>
        </>
      )}
      {variant === 'inventory' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-900">Stock Levels</span>
            <span className="text-amber-600 font-semibold">3 low</span>
          </div>
          {[
            { name: 'Rice 5kg', pct: 78, color: 'bg-emerald-500' },
            { name: 'Cooking Oil', pct: 22, color: 'bg-amber-500' },
            { name: 'Sugar 1kg', pct: 56, color: 'bg-cyan-500' },
          ].map((p) => (
            <div key={p.name} className="mb-1.5 last:mb-0">
              <div className="flex justify-between mb-0.5"><span>{p.name}</span><span className="text-slate-500">{p.pct}%</span></div>
              <div className="h-1 rounded-full bg-slate-200 overflow-hidden">
                <div className={`h-full ${p.color}`} style={{ width: `${p.pct}%` }} />
              </div>
            </div>
          ))}
        </>
      )}
      {variant === 'team' && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-900">Team Activity</span>
            <span className="text-pink-600 font-semibold">5 active</span>
          </div>
          {[
            { name: 'Ama K.', role: 'Manager', color: 'bg-violet-500' },
            { name: 'Kwame O.', role: 'Sales', color: 'bg-cyan-500' },
            { name: 'Zola M.', role: 'Sales', color: 'bg-pink-500' },
          ].map((m) => (
            <div key={m.name} className="flex items-center gap-2 mb-1 last:mb-0">
              <div className={`h-5 w-5 rounded-full ${m.color} flex items-center justify-center text-white text-[8px] font-bold`}>
                {m.name[0]}
              </div>
              <div className="flex-1 flex justify-between">
                <span className="font-medium">{m.name}</span>
                <span className="text-slate-500">{m.role}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </motion.div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
  center = true,
  tone = 'dark',
}: { eyebrow?: string; title: string; sub?: string; center?: boolean; tone?: 'dark' | 'light' }) {
  const isLight = tone === 'light';

  return (
    <div className={center ? 'text-center max-w-3xl mx-auto' : 'max-w-3xl'}>
      {eyebrow && (
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className={`text-xs font-semibold uppercase tracking-[0.2em] mb-3 ${isLight ? 'text-emerald-700' : 'text-violet-300'}`}
        >
          {eyebrow}
        </motion.p>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight ${isLight ? 'text-slate-950' : 'text-white'}`}
      >
        {title}
      </motion.h2>
      {sub && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className={`mt-4 text-base sm:text-lg leading-relaxed ${isLight ? 'text-slate-600' : 'text-white/65'}`}
        >
          {sub}
        </motion.p>
      )}
    </div>
  );
}
