import { describe, expect, it } from 'vitest';

import { mergeProductRows, type CachedProductRow } from '@/lib/workspace';

describe('product workspace compatibility helpers', () => {
  it('preserves cached category and image fields when stable live rows omit them', () => {
    const liveRows: CachedProductRow[] = [
      {
        id: 'shirt',
        name: 'T-shirt',
        sku: 'TS-1001',
        quantity: 85,
        cost_price: 70,
        selling_price: 90,
        low_stock_threshold: 3,
      },
    ];

    const cachedRows: CachedProductRow[] = [
      {
        id: 'shirt',
        business_id: 'business-1',
        name: 'T-shirt',
        sku: 'TS-1001',
        category: 'Clothing',
        image_url: 'https://example.com/product.jpg',
        quantity: 85,
        cost_price: 70,
        selling_price: 90,
        low_stock_threshold: 3,
        is_archived: false,
      },
    ];

    expect(mergeProductRows(liveRows, cachedRows, false)).toEqual([
      expect.objectContaining({
        id: 'shirt',
        category: 'Clothing',
        image_url: 'https://example.com/product.jpg',
      }),
    ]);
  });

  it('lets live empty category and image values clear cached product fields', () => {
    const merged = mergeProductRows(
      [
        {
          id: 'shirt',
          name: 'T-shirt',
          category: '',
          image_url: null,
        },
      ],
      [
        {
          id: 'shirt',
          name: 'T-shirt',
          category: 'Clothing',
          image_url: 'https://example.com/product.jpg',
        },
      ],
      false,
    );

    expect(merged).toEqual([
      expect.objectContaining({
        id: 'shirt',
        category: '',
        image_url: null,
      }),
    ]);
  });
});
