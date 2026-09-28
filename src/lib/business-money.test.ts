import { describe, expect, it } from 'vitest';
import { calculateBusinessFinancials } from '@/lib/business-money';

const emptyActivity = {
  sales: [],
  saleItems: [],
  otherIncome: [],
  expenses: [],
  savings: [],
  investments: [],
  investorFunds: [],
};

describe('inventory dashboard calculations', () => {
  it('updates stock totals after a Current Stock correction without inventing a cash purchase', () => {
    const before = calculateBusinessFinancials({
      ...emptyActivity,
      products: [{ quantity: 5, cost_price: 10, selling_price: 15 }],
      restocks: [],
      openingCashBalance: 100,
    });
    const after = calculateBusinessFinancials({
      ...emptyActivity,
      products: [{ quantity: 8, cost_price: 10, selling_price: 15 }],
      restocks: [],
      openingCashBalance: 100,
    });

    expect(before.stockLeft).toBe(5);
    expect(after.stockLeft).toBe(8);
    expect(after.stockValue).toBe(80);
    expect(after.availableBusinessMoney).toBe(100);
  });

  it('deducts a normal Add Restock purchase from available business money', () => {
    const after = calculateBusinessFinancials({
      ...emptyActivity,
      products: [{ quantity: 8, cost_price: 10, selling_price: 15 }],
      restocks: [{ quantity_added: 3, total_cost: 30, status: 'active' }],
      openingCashBalance: 100,
    });

    expect(after.stockLeft).toBe(8);
    expect(after.stockValue).toBe(80);
    expect(after.restockSpending).toBe(30);
    expect(after.availableBusinessMoney).toBe(70);
  });
});
