import { describe, expect, it } from 'vitest';
import { getReviewMediaStyle, normalizeReviewMediaAdjustment } from '@/lib/review-media';

describe('review media adjustments', () => {
  it('normalizes missing and out-of-range values', () => {
    expect(normalizeReviewMediaAdjustment()).toEqual({
      media_fit: 'cover',
      media_position_x: 50,
      media_position_y: 50,
      media_zoom: 1,
    });

    expect(
      normalizeReviewMediaAdjustment({
        media_fit: 'stretch',
        media_position_x: -10,
        media_position_y: 150,
        media_zoom: 9,
      }),
    ).toEqual({
      media_fit: 'cover',
      media_position_x: 0,
      media_position_y: 100,
      media_zoom: 3,
    });
  });

  it('builds consistent object-fit and focus styles', () => {
    expect(
      getReviewMediaStyle({
        media_fit: 'contain',
        media_position_x: 25,
        media_position_y: 75,
        media_zoom: 1.5,
      }),
    ).toMatchObject({
      objectFit: 'contain',
      objectPosition: '25% 75%',
      transform: 'scale(1.5)',
      transformOrigin: '25% 75%',
    });
  });
});
