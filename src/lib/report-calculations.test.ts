import { describe, expect, it } from 'vitest';
import {
  calculateReportCumulativeFinancials,
  isDefaultLiveDashboardReport,
} from '@/lib/report-calculations';

describe('report dashboard-aligned calculations', () => {
  it('uses live dashboard money only for the current year-only report view', () => {
    expect(
      isDefaultLiveDashboardReport({
        year: '2026',
        currentYear: '2026',
        monthEnabled: false,
        useCustomRange: false,
      }),
    ).toBe(true);

    expect(
      isDefaultLiveDashboardReport({
        year: '2026',
        currentYear: '2026',
        monthEnabled: true,
        useCustomRange: false,
      }),
    ).toBe(false);

    expect(
      isDefaultLiveDashboardReport({
        year: '2025',
        currentYear: '2026',
        monthEnabled: false,
        useCustomRange: false,
      }),
    ).toBe(false);
  });

  it('calculates report available business money cumulatively up to the selected end date', () => {
    const financials = calculateReportCumulativeFinancials({
      to: '2026-06-30',
      openingCashBalance: 100,
      data: {
        sales: [
          { id: 'sale-before', sale_date: '2026-01-15', total: 300, amount_paid: 300, payment_status: 'paid', status: 'completed' },
          { id: 'sale-after', sale_date: '2026-07-01', total: 900, amount_paid: 900, payment_status: 'paid', status: 'completed' },
          { id: 'sale-unpaid', sale_date: '2026-06-20', total: 200, amount_paid: 0, payment_status: 'unpaid', status: 'completed' },
        ],
        saleItems: [
          { sale_id: 'sale-before', quantity: 3, unit_price: 100, cost_price: 40 },
          { sale_id: 'sale-after', quantity: 9, unit_price: 100, cost_price: 40 },
          { sale_id: 'sale-unpaid', quantity: 2, unit_price: 100, cost_price: 40 },
        ],
        products: [],
        otherIncome: [{ income_date: '2026-06-10', amount: 20 }],
        expenses: [{ expense_date: '2026-05-01', amount: 40, category: 'Rent' }],
        savings: [{ savings_date: '2026-06-11', amount: 10 }],
        investments: [{ investment_date: '2026-06-12', amount: 5 }],
        funding: [{ date_received: '2026-06-13', amount: 80 }],
        restocks: [
          { restock_date: '2026-06-14', total_cost: 50, status: 'completed' },
          { restock_date: '2026-06-15', total_cost: 999, status: 'completed', is_opening_stock: true },
          { restock_date: '2026-07-02', total_cost: 500, status: 'completed' },
        ],
      },
    });

    expect(financials.availableBusinessMoney).toBe(395);
    expect(financials.paidSalesRevenue).toBe(300);
    expect(financials.restockSpending).toBe(50);
  });
});
