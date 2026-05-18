// Helpers for date-filtered dashboard reads and for computing transaction
// impact when Available Business Money is negative.

import { getPaidAmount, isRecognizedSale, toNumber } from '@/lib/sales-inventory';

export type DateRange = { from: Date; to: Date };

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function makeDayRange(date: Date): DateRange {
  return { from: startOfDay(date), to: endOfDay(date) };
}

export function makeMonthRange(year: number, month: number): DateRange {
  return {
    from: startOfDay(new Date(year, month, 1)),
    to: endOfDay(new Date(year, month + 1, 0)),
  };
}

export function makeYearRange(year: number): DateRange {
  return {
    from: startOfDay(new Date(year, 0, 1)),
    to: endOfDay(new Date(year, 11, 31)),
  };
}

export function inDateRange(value: string | null | undefined, range: DateRange) {
  if (!value) return false;
  const t = new Date(value).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

/** Sum recognized sales income strictly within range. */
export function sumSalesInRange(sales: any[], range: DateRange) {
  return sales.reduce((sum, sale) => {
    if (!inDateRange(sale.sale_date, range)) return sum;
    return sum + (isRecognizedSale(sale) ? getPaidAmount(sale) : 0);
  }, 0);
}

/** Sum amount-bearing rows whose `dateField` falls in range. */
export function sumAmountsInRange<T extends { amount?: any }>(rows: T[], dateField: keyof T, range: DateRange) {
  return rows.reduce((sum, row: any) => {
    if (!inDateRange(row[dateField], range)) return sum;
    return sum + toNumber(row.amount);
  }, 0);
}

/**
 * Compute the impact of a new outflow (savings / expense / investment) on the
 * Available Business Money, taking into account that when the balance is
 * negative new daily sales are used to fund outflows first and the remainder
 * offsets the negative balance.
 */
export function computeTransactionImpact(args: {
  availableBusinessMoney: number;
  todaySales: number;
  todayOutflowsAlready: number;
  amount: number;
}) {
  const { availableBusinessMoney, todaySales, todayOutflowsAlready, amount } = args;
  const balance_before = availableBusinessMoney;
  const balance_after = availableBusinessMoney - amount;

  // Today's sales that haven't yet been spent
  const salesRemaining = Math.max(0, todaySales - todayOutflowsAlready);
  // How much of the new outflow is funded by today's sales
  const sales_used = Math.min(amount, salesRemaining);
  // Remaining sales after this outflow that could offset negative balance
  const salesLeftAfter = Math.max(0, salesRemaining - sales_used);
  const negative_offset_amount = availableBusinessMoney < 0
    ? Math.min(Math.abs(availableBusinessMoney), salesLeftAfter)
    : 0;

  return {
    balance_before,
    amount,
    balance_after,
    sales_used,
    negative_offset_amount,
    sales_remaining_after: salesLeftAfter - negative_offset_amount,
  };
}
