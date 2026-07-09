import { ReactNode } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { LegalSection } from '@/components/marketing/LegalPageLayout';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow?: string;
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  footerNote?: ReactNode;
};

export function LegalDialog({
  open,
  onOpenChange,
  eyebrow = 'Legal',
  title,
  intro,
  sections,
  footerNote,
}: Props) {
  const lastUpdated = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="kt-marketing max-w-3xl max-h-[85vh] overflow-hidden p-0 border-white/10 bg-[#0b0f15] text-white/85">
        <div className="overflow-y-auto max-h-[85vh] px-6 sm:px-8 py-6 sm:py-8">
          <DialogHeader className="text-left">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/60">
              <ShieldCheck className="h-3.5 w-3.5" />
              {eyebrow}
            </div>
            <DialogTitle className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {title}
            </DialogTitle>
            <p className="text-xs text-white/50">Effective date: {lastUpdated}</p>
          </DialogHeader>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm sm:text-[15px] leading-relaxed text-white/75">
            {intro}
          </div>

          <div className="mt-6 space-y-4">
            {sections.map(({ id, icon: Icon, title: sTitle, body }) => (
              <section
                key={id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-semibold text-white">{sTitle}</h3>
                    <div className="mt-2 text-sm leading-relaxed text-white/70 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-primary [&_a]:font-medium hover:[&_a]:underline">
                      {body}
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>

          {footerNote && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-100/80">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>{footerNote}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
