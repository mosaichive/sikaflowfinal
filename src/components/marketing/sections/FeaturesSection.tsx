import { motion } from 'framer-motion';
import {
  TrendingUp, Package, Receipt, BarChart3, Users, Bell, FileText, LayoutDashboard, Cloud,
  type LucideIcon,
} from 'lucide-react';

const FEATURES: { icon: LucideIcon; title: string; desc: string; accent: string }[] = [
  { icon: TrendingUp, title: 'Sales Tracking', desc: 'Record every sale on web or mobile. See daily, weekly, and monthly totals instantly.', accent: 'from-violet-500/30 to-fuchsia-500/10' },
  { icon: Package, title: 'Inventory Management', desc: 'Track stock levels, restocks, and movements per product across multiple shops.', accent: 'from-cyan-500/30 to-blue-500/10' },
  { icon: Receipt, title: 'Expense Tracking', desc: 'Log expenses by category and attach receipts. Know where your money goes.', accent: 'from-rose-500/30 to-pink-500/10' },
  { icon: BarChart3, title: 'Profit Analytics', desc: 'Automatic profit calculation per sale, per product, per period. No spreadsheets.', accent: 'from-emerald-500/30 to-teal-500/10' },
  { icon: Users, title: 'Team Management', desc: 'Add staff with role-based permissions. Salespeople, managers, distributors.', accent: 'from-amber-500/30 to-orange-500/10' },
  { icon: Bell, title: 'Low Stock Alerts', desc: 'Never run out of best-sellers. Smart alerts when stock dips below your threshold.', accent: 'from-yellow-500/30 to-amber-500/10' },
  { icon: FileText, title: 'Business Reports', desc: 'Generate sales, profit, and inventory reports. Export to PDF or share via WhatsApp.', accent: 'from-fuchsia-500/30 to-violet-500/10' },
  { icon: LayoutDashboard, title: 'Real-time Dashboard', desc: 'A single screen showing sales, profit, expenses, and cash on hand. Live.', accent: 'from-sky-500/30 to-cyan-500/10' },
  { icon: Cloud, title: 'Cloud Sync', desc: 'Your data is safe in the cloud. Sign in from any device, anywhere, anytime.', accent: 'from-indigo-500/30 to-violet-500/10' },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="Features"
          title="Everything you need to run a smarter business"
          sub="From the corner shop to a growing distributor, KudiTrack gives you the tools to track, decide, and grow — without spreadsheets."
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-14">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-xl p-6 transition-all hover:-translate-y-1 hover:shadow-[0_20px_60px_-15px_rgba(139,92,246,0.35)] overflow-hidden"
            >
              <div className={`absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gradient-to-br ${f.accent} blur-3xl opacity-60 group-hover:opacity-100 transition-opacity`} />
              <div className="relative">
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${f.accent} border border-white/10 flex items-center justify-center mb-4`}>
                  <f.icon className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-white/65 leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
  center = true,
}: { eyebrow?: string; title: string; sub?: string; center?: boolean }) {
  return (
    <div className={center ? 'text-center max-w-3xl mx-auto' : 'max-w-3xl'}>
      {eyebrow && (
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300 mb-3"
        >
          {eyebrow}
        </motion.p>
      )}
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
      >
        {title}
      </motion.h2>
      {sub && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-4 text-base sm:text-lg text-white/65 leading-relaxed"
        >
          {sub}
        </motion.p>
      )}
    </div>
  );
}
