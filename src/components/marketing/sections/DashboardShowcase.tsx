import { motion } from 'framer-motion';
import { TrendingUp, Wallet, Receipt, AlertCircle, BarChart3 } from 'lucide-react';
import { SectionHeader } from './FeaturesSection';
import { AnimatedNumber } from '@/components/AnimatedNumber';

export function DashboardShowcase() {
  return (
    <section id="dashboard" className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="Dashboard"
          title="Your business at a glance"
          sub="Designed for the way real African businesses operate — fast, clear, and mobile-first."
        />

        <div className="relative mt-16">
          {/* Glow */}
          <div className="absolute inset-x-10 top-10 h-72 bg-gradient-to-r from-violet-500/30 via-fuchsia-500/30 to-cyan-400/30 blur-3xl opacity-60 pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-5 sm:p-8 shadow-[0_40px_120px_-30px_rgba(139,92,246,0.5)]"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between pb-5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                </div>
                <span className="text-xs text-white/50 ml-3">app.kuditrack.online</span>
              </div>
              <div className="text-xs text-white/60">Dashboard</div>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <KpiCard icon={TrendingUp} label="Daily Sales" value={12480} prefix="GHS " accent="from-violet-500/20 to-fuchsia-500/5" />
              <KpiCard icon={BarChart3} label="Profit" value={3920} prefix="GHS " accent="from-emerald-500/20 to-teal-500/5" />
              <KpiCard icon={Receipt} label="Expenses" value={1640} prefix="GHS " accent="from-rose-500/20 to-pink-500/5" />
              <KpiCard icon={Wallet} label="Business Money" value={24300} prefix="GHS " accent="from-cyan-500/20 to-blue-500/5" />
            </div>

            {/* Lower row: chart + alerts */}
            <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-white/50">Sales — last 7 days</p>
                    <p className="text-2xl font-bold mt-1">
                      GHS <AnimatedNumber value={68240} formatter={(n) => Math.round(n).toLocaleString()} />
                    </p>
                  </div>
                  <div className="text-xs text-emerald-300">+24% WoW</div>
                </div>
                <div className="h-44 flex items-end gap-2">
                  {[40, 55, 48, 70, 60, 85, 95].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      whileInView={{ height: `${h}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06, duration: 0.6 }}
                      className="flex-1 rounded-md bg-gradient-to-t from-violet-500 to-cyan-400 opacity-90"
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
                    <div key={p.name} className="flex items-center justify-between text-xs rounded-lg bg-white/5 px-3 py-2.5 border border-white/5">
                      <span className="text-white/80">{p.name}</span>
                      <span className="text-amber-300 font-semibold">{p.left} left</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Floating side mockup (mobile) */}
          <motion.div
            initial={{ opacity: 0, x: 40, y: 40 }}
            whileInView={{ opacity: 1, x: 0, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="hidden xl:block absolute -right-6 -bottom-10 w-56 rounded-[2rem] border border-white/15 bg-black/80 backdrop-blur p-3 shadow-2xl"
          >
            <div className="rounded-[1.4rem] bg-gradient-to-br from-violet-900/40 to-cyan-900/40 p-4 h-72">
              <p className="text-[10px] uppercase tracking-widest text-white/50">Mobile</p>
              <p className="text-xl font-bold mt-1">GHS 1,820</p>
              <p className="text-[10px] text-emerald-300">Today's profit</p>
              <div className="mt-4 space-y-2">
                {[60, 80, 45, 70].map((w, i) => (
                  <div key={i} className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${w}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                      className="h-full bg-gradient-to-r from-violet-400 to-cyan-300"
                    />
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
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
      className={`relative rounded-2xl border border-white/10 bg-gradient-to-br ${accent} p-4 overflow-hidden`}
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
