import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getReviewAvatarStyle, getReviewMediaStyle, type ReviewMediaFit } from '@/lib/review-media';

type Review = {
  id: string;
  customer_name: string;
  business_name: string | null;
  testimonial: string;
  rating: number;
  media_url: string | null;
  media_type: 'image' | 'video' | null;
  media_fit?: ReviewMediaFit | null;
  media_position_x?: number | null;
  media_position_y?: number | null;
  media_zoom?: number | null;
  avatar_url: string | null;
  avatar_fit?: ReviewMediaFit | null;
  avatar_position_x?: number | null;
  avatar_position_y?: number | null;
  avatar_zoom?: number | null;
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
    let cancelled = false;

    const fetchReviews = async () => {
      const { data, error } = await (supabase as any)
        .from('marketing_reviews')
        .select('*')
        .eq('visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (cancelled) return;
      if (error) console.error('[ReviewsSection] fetch error', error);

      const rows = (data || []) as Review[];
      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      setReviews(unique);
      setLoaded(true);
    };

    void fetchReviews();

    const channel = supabase
      .channel('marketing_reviews_public')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marketing_reviews' },
        () => { void fetchReviews(); },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
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

  const marqueeBaseItems = useMemo(() => buildMarqueeBase(showcaseItems), [showcaseItems]);
  const marqueeItems = useMemo(() => [...marqueeBaseItems, ...marqueeBaseItems], [marqueeBaseItems]);
  const marqueeDuration = Math.max(72, marqueeBaseItems.length * 12);

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

      <div className="mt-12 relative">
        <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-r from-[#faf7f1] to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-[#faf7f1] to-transparent z-10 pointer-events-none" />
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: marqueeDuration, repeat: Infinity, ease: 'linear' }}
          className="flex w-max gap-4 px-5 sm:gap-5 sm:px-8"
        >
          {marqueeItems.map((item, i) => {
            const isClone = i >= marqueeBaseItems.length;
            return (
              <div key={`${item.key}-${i}`} aria-hidden={isClone ? true : undefined}>
                {item.kind === 'media'
                  ? <MediaCard review={item.review} />
                  : <TextCard review={item.review} accent={ACCENTS[i % ACCENTS.length]} />}
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function buildMarqueeBase(items: ShowcaseItem[]) {
  if (items.length === 0) return [];

  const base: ShowcaseItem[] = [];
  while (base.length < 6) {
    base.push(...items);
  }
  return base;
}

function MediaCard({ review }: { review: Review }) {
  return (
    <div className="w-[220px] sm:w-[260px] lg:w-[300px] h-[320px] sm:h-[360px] shrink-0 rounded-[24px] overflow-hidden relative shadow-[0_18px_45px_-24px_rgba(0,0,0,0.28)] bg-slate-100">
      {review.media_type === 'video' && review.media_url ? (
        <video
          src={review.media_url}
          className="absolute inset-0 h-full w-full"
          style={getReviewMediaStyle(review)}
          autoPlay muted loop playsInline
        />
      ) : (
        <img src={review.media_url!} alt={review.customer_name} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full" style={getReviewMediaStyle(review)} />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4">
        <div className="flex items-center gap-2 mb-1">
          {Array.from({ length: review.rating }).map((_, k) => (
            <Star key={k} className="h-3 w-3 fill-amber-300 text-amber-300" />
          ))}
        </div>
        <p className="text-white font-semibold text-sm">{review.customer_name}</p>
        {review.business_name && <p className="text-white/80 text-xs">{review.business_name}</p>}
      </div>
    </div>
  );
}

function TextCard({ review, accent }: { review: Review; accent: string }) {
  return (
    <div className="w-[250px] sm:w-[300px] lg:w-[330px] h-[320px] sm:h-[360px] shrink-0 rounded-[24px] bg-white border border-slate-200/80 p-5 sm:p-6 flex flex-col shadow-[0_18px_45px_-26px_rgba(0,0,0,0.2)]">
      <div className="flex gap-1 mb-3">
        {Array.from({ length: review.rating }).map((_, k) => (
          <Star key={k} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="text-slate-800 text-sm sm:text-[15px] leading-relaxed flex-1 overflow-hidden [display:-webkit-box] [-webkit-line-clamp:9] [-webkit-box-orient:vertical]">
        “{normalizeTestimonial(review.testimonial)}”
      </p>
      <div className="mt-5 flex items-center gap-3">
        {review.avatar_url ? (
          <div className="h-9 w-9 rounded-full overflow-hidden bg-slate-100 shrink-0">
            <img src={review.avatar_url} alt={review.customer_name} className="h-full w-full" style={getReviewAvatarStyle(review)} />
          </div>
        ) : (
          <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${accent} flex items-center justify-center text-[11px] font-bold text-white`}>
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
