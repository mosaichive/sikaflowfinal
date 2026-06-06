import { describe, expect, it } from 'vitest';

import {
  buildDamagedGoodsRowsFromStockMovements,
  calculateDamagedGoodsSummary,
  getDamagedGoodsValue,
  groupDamagedGoodsByProduct,
  isDamagedGoodsMovement,
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

  it('detects damaged goods stock movements from old schemas', () => {
    expect(isDamagedGoodsMovement({ reason: 'damaged_stock', change: -1 })).toBe(true);
    expect(isDamagedGoodsMovement({ movement_type: 'damaged_stock', quantity_change: -1 })).toBe(true);
    expect(isDamagedGoodsMovement({ note: 'Damaged goods: Torn - incident details' })).toBe(true);
    expect(isDamagedGoodsMovement({ reason: 'sold', change: -1 })).toBe(false);
  });

  it('builds damaged goods history from stock movements when the damaged_goods table is missing', () => {
    const rows = buildDamagedGoodsRowsFromStockMovements(
      [
        {
          id: 'move-1',
          product_id: 'shirt',
          change: -2,
          reason: 'damaged_stock',
          note: 'Damaged goods: Torn - zipper issue',
          added_by_name: 'Maame',
          created_at: '2026-06-06T12:00:00Z',
        },
        {
          id: 'sale-1',
          product_id: 'shirt',
          change: -1,
          reason: 'sold',
          note: 'Sale',
          created_at: '2026-06-06T12:01:00Z',
        },
      ],
      [
        {
          id: 'shirt',
          name: 'T-shirt',
          category: 'Fashion',
          quantity: 83,
          cost_price: 70,
        },
      ],
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'stock-movement-move-1',
        product_id: 'shirt',
        product_name: 'T-shirt',
        category: 'Fashion',
        quantity: 2,
        quantity_after: 83,
        reason: 'Torn',
        notes: 'zipper issue',
        unit_cost: 70,
        total_value: 140,
        recorded_by_name: 'Maame',
        damage_date: '2026-06-06T12:00:00Z',
      }),
    ]);
  });
});
