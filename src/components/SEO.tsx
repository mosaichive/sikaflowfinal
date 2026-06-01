import { useEffect } from 'react';
import { absoluteUrl, DEFAULT_OG_IMAGE, DEFAULT_SEO, type PageSeo } from '@/lib/seo';

type SEOProps = Partial<PageSeo> & {
  canonical?: string;
};

export function SEO({
  title = DEFAULT_SEO.title,
  description = DEFAULT_SEO.description,
  path = DEFAULT_SEO.path,
  image = DEFAULT_OG_IMAGE,
  canonical,
  noindex = false,
}: SEOProps) {
  const url = canonical || absoluteUrl(path);
  const imageUrl = image.startsWith('http') ? image : absoluteUrl(image);
  const robots = noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  useEffect(() => {
    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', robots);
    upsertCanonical(url);

    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', 'KudiTrack');
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:image', imageUrl);
    upsertMeta('property', 'og:image:secure_url', imageUrl);
    upsertMeta('property', 'og:image:width', '1280');
    upsertMeta('property', 'og:image:height', '720');
    upsertMeta('property', 'og:image:alt', 'KudiTrack business dashboard preview');

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', imageUrl);
    upsertMeta('name', 'twitter:image:alt', 'KudiTrack business dashboard preview');
  }, [description, imageUrl, robots, title, url]);

  return null;
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}
