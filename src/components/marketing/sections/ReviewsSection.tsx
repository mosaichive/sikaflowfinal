import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { SectionHeader } from './FeaturesSection';

const REVIEWS = [
  { name: 'Akua Mensah', biz: 'Akua Provisions, Kumasi', initials: 'AM', stars: 5, text: 'KudiTrack helped me finally understand my actual business profit. I used to think I was making more than I really was.' },
  { name: 'Kwame Boateng', biz: 'Boateng Electronics', initials: 'KB', stars: 5, text: "Stock alerts are a game changer. I never run out of best-sellers anymore — my customers always find what they need." },
  { name: 'Esther Owusu', biz: 'Esi Beauty Lounge', initials: 'EO', stars: 5, text: "Setup took 10 minutes. My salesperson uses it on her phone every day. Reports are ready when I need them." },
  { name: 'Yaw Asante', biz: 'Asante Distributors', initials: 'YA', stars: 5, text: 'Managing three shops from one dashboard saved me hours each week. The expense tracking is brilliant.' },
  { name: 'Ama Sarpong', biz: 'Ama Foods', initials: 'AS', stars: 5, text: "The WhatsApp report sharing is genius. I just send daily summary to my accountant. Done." },
  { name: 'Kojo Adjei', biz: 'Adjei Spare Parts', initials: 'KA', stars: 5, text: 'I trust the numbers now. No more arguing with myself about how much I made.' },
];

export function ReviewsSection() {
  // Duplicate for seamless marquee
  const row1 = REVIEWS;
  const row2 = [...REVIEWS].reverse();

  return (
    <section id="reviews" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="Loved by businesses"
          title="Trusted by shop owners across Ghana"
          sub="From neighborhood shops to growing distributors — see why owners choose KudiTrack."
        />
      </div>

      <div className="mt-14 space-y-6">
        <Marquee items={row1} duration={50} />
        <Marquee items={row2} duration={60} reverse />
      </div>
    </section>
  );
}

function Marquee({ items, duration, reverse = false }: { items: typeof REVIEWS; duration: number; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
      <motion.div
        animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
        className="flex gap-5 w-max"
      >
        {doubled.map((r, i) => (
          <ReviewCard key={i} {...r} />
        ))}
      </motion.div>
    </div>
  );
}

function ReviewCard({ name, biz, initials, stars, text }: typeof REVIEWS[number]) {
  return (
    <div className="w-[340px] sm:w-[400px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]">
      <div className="flex gap-0.5 mb-3">
        {Array.from({ length: stars }).map((_, i) => (
          <Star key={i} className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
        ))}
      </div>
      <p className="text-sm text-white/85 leading-relaxed">"{text}"</p>
      <div className="mt-5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-xs font-bold text-black">
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-white/55">{biz}</p>
        </div>
      </div>
    </div>
  );
}
