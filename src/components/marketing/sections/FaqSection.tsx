import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';

const FAQ = [
  { q: 'How does KudiTrack work?', a: 'KudiTrack runs on your phone and computer. You record sales, restocks, and expenses; KudiTrack does the math and shows your real profit, stock levels, and cash position in real time.' },
  { q: 'Can I track inventory?', a: 'Yes. Track stock per product, log restocks, set low-stock alerts, and see movement history for every item.' },
  { q: 'Does it work on mobile?', a: 'Absolutely. KudiTrack is mobile-first. You can record a sale or check today\'s profit from any phone with a browser.' },
  { q: 'Can I add staff?', a: 'Yes. Add salespeople, managers, or distributors with role-based permissions so they only see what they should.' },
  { q: 'Is my data secure?', a: 'Your data is encrypted in transit and at rest, with row-level security ensuring only you (and people you invite) can access your business data.' },
  { q: 'Can I use it for multiple shops?', a: 'Yes — the Pro plan lets you manage multiple shops from one dashboard with per-shop reports.' },
];

export function FaqSection() {
  return (
    <section id="faq" className="relative bg-white py-24 text-slate-900 sm:py-32">
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
            FAQ
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            Everything you need to know before getting started.
          </p>
        </div>

        <Accordion type="single" collapsible className="mt-10 space-y-3">
          {FAQ.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="rounded-2xl border border-slate-200 bg-white px-5 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)] [&[data-state=open]]:bg-slate-50"
            >
              <AccordionTrigger className="py-5 text-left text-sm font-semibold text-slate-950 hover:no-underline sm:text-base">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5 text-sm leading-relaxed text-slate-600">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
