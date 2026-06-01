import { describe, expect, it } from 'vitest';
import { absoluteUrl, DEFAULT_SEO, getMarketingSeo } from '@/lib/seo';

describe('seo helpers', () => {
  it('builds canonical absolute URLs', () => {
    expect(absoluteUrl('/features')).toBe('https://kuditrack.online/features');
    expect(absoluteUrl('contact')).toBe('https://kuditrack.online/contact');
    expect(absoluteUrl('/')).toBe('https://kuditrack.online/');
  });

  it('returns route-specific marketing SEO', () => {
    expect(getMarketingSeo('/features').title).toContain('KudiTrack Features');
    expect(getMarketingSeo('/advertise').path).toBe('/advertise');
  });

  it('falls back to home SEO for unknown marketing routes', () => {
    expect(getMarketingSeo('/missing')).toEqual(DEFAULT_SEO);
  });
});
