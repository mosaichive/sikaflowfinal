import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type Ad = {
  id: string;
  title: string;
  description: string;
  cta_text: string | null;
  cta_url: string | null;
  active: boolean;
  sort_order: number;
};

const ROTATE_MS = 6000;

export function HeaderAdsTicker() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('platform_ads' as any)
        .select('id,title,description,cta_text,cta_url,active,sort_order')
        .eq('active', true)
        .order('sort_order')
        .order('created_at');
      if (!cancelled) {
        setAds(((data as any[]) ?? []) as Ad[]);
        setIndex(0);
      }
    };

    void load();

    const channel = supabase
      .channel('header-ads-ticker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_ads' }, () => { void load(); })
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % ads.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [ads.length]);

  const current = useMemo(() => ads[index] ?? null, [ads, index]);
  if (!current) return <div className="min-w-0 flex-1" aria-hidden="true" />;

  const isExternal = current.cta_url ? /^https?:\/\//i.test(current.cta_url) : false;
  const label = current.cta_text || 'Learn more';
  const mobileAds = [...ads, ...ads];

  const renderMobileAd = (ad: Ad, itemIndex: number) => {
    const href = ad.cta_url?.trim();
    const external = href ? /^https?:\/\//i.test(href) : false;
    const itemLabel = ad.cta_text || ad.description;
    const item = (
      <span className="inline-flex h-6 max-w-[180px] items-center gap-1 rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary">
        <span className="truncate">{ad.title}</span>
        {itemLabel ? <span className="shrink-0 text-primary/70">- {itemLabel}</span> : null}
        {external ? <ExternalLink className="h-2.5 w-2.5 shrink-0" /> : null}
      </span>
    );

    return href ? (
      <a key={`${ad.id}-mobile-${itemIndex}`} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
        {item}
      </a>
    ) : (
      <span key={`${ad.id}-mobile-${itemIndex}`}>{item}</span>
    );
  };

  const content = (
    <span className="flex items-center gap-2 truncate">
      <span className="hidden sm:inline truncate font-medium text-foreground">{current.title}</span>
      <span className="hidden md:inline truncate text-muted-foreground">{current.description}</span>
      {current.cta_url ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {label}
          {isExternal ? <ExternalLink className="h-3 w-3" /> : null}
        </span>
      ) : null}
    </span>
  );

  return (
    <>
      <div className="min-w-0 flex-1 sm:hidden">
        <div className="relative h-8 overflow-hidden rounded-full border border-border/70 bg-muted/30">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-card to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-card to-transparent" />
          <div className="flex h-full w-max items-center gap-2 whitespace-nowrap px-2 will-change-transform [animation:header-ad-marquee-ltr_18s_linear_infinite]">
            {mobileAds.map(renderMobileAd)}
          </div>
        </div>
      </div>

      <div className="hidden flex-1 min-w-0 items-center justify-center px-4 sm:flex">
        {current.cta_url ? (
          <a
            href={current.cta_url}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noreferrer' : undefined}
            className="flex max-w-xl min-w-0 items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs hover:bg-muted transition-colors"
          >
            {content}
          </a>
        ) : (
          <div className="flex max-w-xl min-w-0 items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs">
            {content}
          </div>
        )}
      </div>
    </>
  );
}
