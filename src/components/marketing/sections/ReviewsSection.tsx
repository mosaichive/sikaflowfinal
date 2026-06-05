import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Review = {
  id: string;
  customer_name: string;
  business_name: string | null;
  testimonial: string;
  rating: number;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  avatar_url: string | null;
};

const ACCENTS = ['from-emerald-400 to-emerald-600', 'from-blue-400 to-blue-600', 'from-amber-400 to-amber-500', 'from-emerald-500 to-blue-500'];

type ShowcaseItem = {
  key: string;
  kind: 'media' | 'text';
  review: Review;
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('') || '•';
}

function normalizeTestimonial(text: string) {
  return text.trim().replace(/^"+|"+$/g, '');
}

export function ReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from('marketing_reviews')
        .select('id, customer_name, business_name, testimonial, rating, media_url, media_type, avatar_url, sort_order, created_at')
        .eq('visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ReviewsSection] fetch error', error);
      }

      const rows = (data || []) as Review[];
      // De-duplicate defensively by id
      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      console.log('[ReviewsSection] fetched', rows.length, 'rows; unique', unique.length, 'ids:', unique.map((r) => r.id));
      setReviews(unique);
      setLoaded(true);
    })();
  }, []);

  const showcaseItems = useMemo<ShowcaseItem[]>(() => (
    reviews.flatMap((review) => {
      const items: ShowcaseItem[] = [];

      if (review.media_url) {
        items.push({ key: `${review.id}-media`, kind: 'media', review });
      }

      items.push({ key: `${review.id}-text`, kind: 'text', review });
      return items;
    })
  ), [reviews]);

  // Only enable infinite marquee when we have enough cards to fill the row.
  const enableMarquee = showcaseItems.length > 6;
  const marqueeItems = useMemo(() => (enableMarquee ? [...showcaseItems, ...showcaseItems] : showcaseItems), [enableMarquee, showcaseItems]);

  if (loaded && reviews.length === 0) return null;

  return (
    <section id="reviews" className="relative py-24 sm:py-32 bg-[#faf7f1] overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Customer love</p>
          <h2 className="mt-3 text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">
            Trusted by Business Owners
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto">
            See how KudiTrack helps businesses track sales, manage inventory, and know their money.
          </p>
        </div>
      </div>

      <div className="mt-16 relative">
        {enableMarquee ? (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#faf7f1] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#faf7f1] to-transparent z-10 pointer-events-none" />
            <motion.div
              animate={{ x: ['0%', '-50%'] }}
              transition={{ duration: Math.max(40, reviews.length * 8), repeat: Infinity, ease: 'linear' }}
              className="flex gap-6 w-max px-5 sm:px-8"
            >
              {marqueeItems.map((item, i) => {
                // Cloned slides (second half) are decorative — hide from assistive tech
                const isClone = i >= showcaseItems.length;
                return (
                  <div key={`${item.key}-${i}`} aria-hidden={isClone ? true : undefined}>
                    {item.kind === 'media'
                      ? <MediaCard review={item.review} />
                      : <TextCard review={item.review} accent={ACCENTS[i % ACCENTS.length]} />}
                  </div>
                );
              })}
            </motion.div>
          </>
        ) : (
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            <div className="flex flex-wrap justify-center gap-6">
              {showcaseItems.map((item, i) => {
                return item.kind === 'media'
                  ? <MediaCard key={item.key} review={item.review} />
                  : <TextCard key={item.key} review={item.review} accent={ACCENTS[i % ACCENTS.length]} />;
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MediaCard({ review }: { review: Review }) {
  return (
    <div className="w-[300px] sm:w-[360px] h-[440px] shrink-0 rounded-[32px] overflow-hidden relative shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] bg-slate-100">
      {review.media_type === 'video' && review.media_url ? (
        <video
          src={review.media_url}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay muted loop playsInline
        />
      ) : (
        <img src={review.media_url!} alt={review.customer_name} className="absolute inset-0 h-full w-full object-cover" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-5">
        <div className="flex items-center gap-2 mb-1">
          {Array.from({ length: review.rating }).map((_, k) => (
            <Star key={k} className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
          ))}
        </div>
        <p className="text-white font-semibold text-base">{review.customer_name}</p>
        {review.business_name && <p className="text-white/80 text-xs">{review.business_name}</p>}
      </div>
    </div>
  );
}

function TextCard({ review, accent }: { review: Review; accent: string }) {
  return (
    <div className="w-[320px] sm:w-[380px] h-[440px] shrink-0 rounded-[32px] bg-white border border-slate-200/80 p-7 flex flex-col shadow-[0_20px_60px_-30px_rgba(0,0,0,0.18)]">
      <div className="flex gap-1 mb-4">
        {Array.from({ length: review.rating }).map((_, k) => (
          <Star key={k} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="text-slate-800 text-[17px] leading-relaxed flex-1">“{normalizeTestimonial(review.testimonial)}”</p>
      <div className="mt-6 flex items-center gap-3">
        {review.avatar_url ? (
          <img src={review.avatar_url} alt={review.customer_name} className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className={`h-11 w-11 rounded-full bg-gradient-to-br ${accent} flex items-center justify-center text-xs font-bold text-white`}>
            {initials(review.customer_name)}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-slate-900">{review.customer_name}</p>
          {review.business_name && <p className="text-xs text-slate-500">{review.business_name}</p>}
        </div>
      </div>
    </div>
  );
}
