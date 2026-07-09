import { Link } from 'react-router-dom';
import { ReactNode, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, ShieldCheck, LucideIcon } from 'lucide-react';

export type LegalSection = {
  id: string;
  icon: LucideIcon;
  title: string;
  body: ReactNode;
};

type Props = {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  footerNote?: ReactNode;
};

export function LegalPageLayout({ eyebrow, title, intro, sections, footerNote }: Props) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? '');
  const lastUpdated = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveId(e.target.id);
        });
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20 text-white/85">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10 sm:mb-14 text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/60">
          <ShieldCheck className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
        <h1 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-3 text-sm text-white/50">Effective date: {lastUpdated}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 mb-10"
      >
        <div className="text-base leading-relaxed text-white/75">{intro}</div>
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        {/* TOC */}
        <aside className="lg:sticky lg:top-28 self-start">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="px-2 pb-2 text-[11px] uppercase tracking-widest text-white/50">
              On this page
            </p>
            <nav className="space-y-1">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeId === s.id
                      ? 'bg-primary/15 text-white'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {s.title}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Sections */}
        <div className="space-y-6">
          {sections.map(({ id, icon: Icon, title, body }, i) => (
            <motion.section
              key={id}
              id={id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.4, delay: i * 0.03 }}
              className="scroll-mt-28 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 transition-colors hover:border-white/20"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg sm:text-xl font-semibold text-white">{title}</h2>
                  <div className="mt-3 text-sm sm:text-[15px] leading-relaxed text-white/70 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary [&_a]:font-medium hover:[&_a]:underline">
                    {body}
                  </div>
                </div>
              </div>
            </motion.section>
          ))}
        </div>
      </div>

      {footerNote && (
        <div className="mt-10 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm text-amber-100/80">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>{footerNote}</div>
        </div>
      )}

      <div className="mt-8 text-center text-xs text-white/40">
        <Link to="/" className="hover:text-white/70">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
