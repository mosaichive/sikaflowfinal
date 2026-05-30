import { motion } from 'framer-motion';
import { NotebookPen, Calculator, PackageX, CheckCircle2, Sparkles } from 'lucide-react';
import { SectionHeader } from './FeaturesSection';

export function ProblemSection() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="The problem"
          title="You're making sales every day… but do you know your real profit?"
          sub="Notebooks get lost. Calculators give wrong answers. Stock disappears. Stop guessing — start knowing."
        />

        <div className="mt-16 grid lg:grid-cols-2 gap-8 items-stretch">
          {/* Before */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative rounded-3xl border border-rose-500/20 bg-gradient-to-br from-rose-950/40 to-zinc-950 p-7 overflow-hidden"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-rose-300/80">Before KudiTrack</p>
            <h3 className="mt-2 text-2xl font-bold">The old way</h3>
            <div className="mt-6 space-y-3">
              <ProblemRow icon={NotebookPen} text="Messy notebooks you can't find when you need them" />
              <ProblemRow icon={Calculator} text="Calculator stress at the end of every day" />
              <ProblemRow icon={PackageX} text="Stock confusion — you never know what's left" />
              <ProblemRow icon={Calculator} text='"How much did I really make?" — no clear answer' />
            </div>
            {/* Decorative scribble */}
            <div className="mt-8 rounded-xl border border-rose-500/20 bg-black/30 p-4 font-mono text-xs text-rose-200/70 leading-loose">
              <div className="line-through opacity-70">Rice — 480</div>
              <div className="line-through opacity-70">Sugar — 18 ?? 28 ??</div>
              <div>Coke — ??</div>
              <div className="opacity-60">Total: ___________</div>
            </div>
          </motion.div>

          {/* After */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative rounded-3xl border border-emerald-500/25 bg-gradient-to-br from-emerald-950/40 to-zinc-950 p-7 overflow-hidden"
          >
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/90 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> After KudiTrack
              </p>
              <h3 className="mt-2 text-2xl font-bold">Clear, organized, calm</h3>
              <div className="mt-6 space-y-3">
                <SolutionRow text="Every sale recorded automatically" />
                <SolutionRow text="Profit calculated in real time" />
                <SolutionRow text="Low-stock alerts before you run out" />
                <SolutionRow text="One dashboard for the whole business" />
              </div>
              {/* Mini dashboard */}
              <div className="mt-8 rounded-xl border border-emerald-500/20 bg-black/40 p-4">
                <div className="flex justify-between text-xs">
                  <span className="text-white/60">Today's profit</span>
                  <span className="text-emerald-300 font-bold">GHS 1,820</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: '78%' }}
                    viewport={{ once: true }}
                    transition={{ duration: 1.2, delay: 0.5 }}
                    className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                  />
                </div>
                <div className="mt-2 text-[10px] text-white/50">78% of your daily target</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ProblemRow({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-white/80">
      <div className="mt-0.5 h-7 w-7 rounded-lg bg-rose-500/15 border border-rose-500/25 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-rose-300" />
      </div>
      <span>{text}</span>
    </div>
  );
}

function SolutionRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 text-sm text-white/90">
      <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}
