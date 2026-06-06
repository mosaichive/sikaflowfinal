import { describe, expect, it } from 'vitest';

import {
  calculateDamagedGoodsSummary,
  getDamagedGoodsValue,
  groupDamagedGoodsByProduct,
} from '@/lib/damaged-goods';

describe('damaged goods inventory loss helpers', () => {
  it('uses stored total value when present and falls back to quantity times unit cost', () => {
    expect(getDamagedGoodsValue({ quantity: 3, unit_cost: 8, total_value: 0 })).toBe(24);
    expect(getDamagedGoodsValue({ quantity: 3, unit_cost: 8, total_value: 21 })).toBe(21);
  });

  it('summarizes damaged quantity and stock-loss value without producing income values', () => {
    const summary = calculateDamagedGoodsSummary([
      { product_id: 'bag', product_name: 'Bag', quantity: 3, unit_cost: 10 },
      { product_id: 'shoe', product_name: 'Shoe', quantity: 2, total_value: 15 },
    ]);

    expect(summary.quantity).toBe(5);
    expect(summary.value).toBe(45);
  });

  it('groups damaged goods by product for inventory reports', () => {
    const grouped = groupDamagedGoodsByProduct([
      { product_id: 'bag', product_name: 'Bag', quantity: 3, unit_cost: 10 },
      { product_id: 'bag', product_name: 'Bag', quantity: 1, unit_cost: 10 },
      { product_id: 'shoe', product_name: 'Shoe', quantity: 2, unit_cost: 4 },
    ]);

    expect(grouped).toEqual([
      { productId: 'bag', productName: 'Bag', quantity: 4, value: 40 },
      { productId: 'shoe', productName: 'Shoe', quantity: 2, value: 8 },
    ]);
  });
});
