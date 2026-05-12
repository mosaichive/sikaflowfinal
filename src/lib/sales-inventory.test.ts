import { describe, expect, it } from 'vitest';
import { calculateFinancialSnapshot } from './sales-inventory';

describe('calculateFinancialSnapshot', () => {
  it('uses stock movements as the source for stock, available money, and profit', () => {
    const products = [
      {
        id: 'product-1',
        quantity: 0,
        cost_price: 10,
        selling_price: 20,
        low_stock_threshold: 5,
      },
    ];
    const paidSale = {
      id: 'sale-1',
      total: 300,
      amount_paid: 300,
      payment_status: 'paid',
      status: 'completed',
    };
    const saleItem = {
      sale_id: 'sale-1',
      quantity: 15,
      unit_cost: 10,
      unit_price: 20,
    };

    const afterSale = calculateFinancialSnapshot({
      sales: [paidSale],
      saleItems: [saleItem],
      products,
      expenses: [],
      otherIncome: [],
      savings: [],
      investments: [],
      stockMovements: [
        { product_id: 'product-1', movement_type: 'opening_stock', quantity_change: 90, unit_cost: 10 },
        { product_id: 'product-1', movement_type: 'sale', quantity_change: -15, unit_cost: 10 },
      ],
    });

    expect(afterSale.stockLeft).toBe(75);
    expect(afterSale.paidSalesRevenue).toBe(300);
    expect(afterSale.availableBusinessMoney).toBe(300);

    const afterExpenseSavingsAndRestock = calculateFinancialSnapshot({
      sales: [paidSale],
      saleItems: [saleItem],
      products,
      expenses: [{ amount: 50, category: 'operations' }],
      otherIncome: [],
      savings: [{ amount: 20 }],
      investments: [],
      stockMovements: [
        { product_id: 'product-1', movement_type: 'opening_stock', quantity_change: 90, unit_cost: 10 },
        { product_id: 'product-1', movement_type: 'sale', quantity_change: -15, unit_cost: 10 },
        { product_id: 'product-1', movement_type: 'restock', quantity_change: 10, unit_cost: 10 },
      ],
    });

    expect(afterExpenseSavingsAndRestock.stockLeft).toBe(85);
    expect(afterExpenseSavingsAndRestock.availableBusinessMoney).toBe(130);
    expect(afterExpenseSavingsAndRestock.profit).toBe(100);
  });
});
