import { describe, expect, it } from 'vitest';
import { buildReportStatement } from '@/lib/report-slip';

describe('buildReportStatement', () => {
  it('deducts only normal non-cancelled restocks from the running balance', () => {
    const statement = buildReportStatement({
      from: '2026-06-01',
      to: '2026-06-30',
      openingCashBalance: 100,
      sales: [],
      saleItems: [],
      expenses: [],
      otherIncome: [],
      savings: [],
      investments: [],
      fundings: [],
      products: [],
      openingStockMovements: [],
      restocks: [
        { id: 'normal', restock_date: '2026-06-10', total_cost: 50, status: 'completed', is_opening_stock: false },
        { id: 'opening', restock_date: '2026-06-11', total_cost: 999, status: 'completed', is_opening_stock: true },
        { id: 'cancelled', restock_date: '2026-06-12', total_cost: 500, status: 'cancelled', is_opening_stock: false },
      ],
    });

    expect(statement.totalMoneyOut).toBe(50);
    expect(statement.closingBalance).toBe(50);
    expect(statement.summary.totalRestocks).toBe(50);
    expect(statement.summary.availableBusinessMoney).toBe(50);
    expect(statement.rows.map((row) => row.reference)).toEqual(['RST-NORMAL']);
  });
});
