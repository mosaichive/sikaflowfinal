import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionHeader } from './FeaturesSection';

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
    <section id="faq" className="relative py-24 sm:py-32">
      <div className="max-w-3xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="FAQ"
          title="Frequently asked questions"
          sub="Everything you need to know before getting started."
        />

        <Accordion type="single" collapsible className="mt-10 space-y-3">
          {FAQ.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur px-5 [&[data-state=open]]:bg-white/[0.06]"
            >
              <AccordionTrigger className="text-left text-sm sm:text-base font-medium hover:no-underline py-5 text-white">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-white/70 pb-5 leading-relaxed">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
