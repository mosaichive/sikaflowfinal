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
  if (!current) return null;

  const isExternal = current.cta_url ? /^https?:\/\//i.test(current.cta_url) : false;
  const label = current.cta_text || 'Learn more';
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
    <div className="hidden sm:flex flex-1 min-w-0 items-center justify-center px-4">
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
  );
}
