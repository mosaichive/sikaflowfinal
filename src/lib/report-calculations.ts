import { calculateBusinessFinancials } from '@/lib/business-money';

type DateValue = string | null | undefined;

export type ReportFinancialData = {
  sales: any[];
  saleItems: any[];
  products: any[];
  expenses: any[];
  savings: any[];
  investments: any[];
  funding: any[];
  restocks: any[];
  otherIncome: any[];
};

function timestamp(value: DateValue) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

function onOrBefore(value: DateValue, endDate: string) {
  const time = timestamp(value);
  const end = new Date(`${endDate}T23:59:59`).getTime();
  return Number.isFinite(time) && time <= end;
}

export function isDefaultLiveDashboardReport({
  year,
  currentYear,
  monthEnabled,
  useCustomRange,
}: {
  year: string;
  currentYear: string;
  monthEnabled: boolean;
  useCustomRange: boolean;
}) {
  return !useCustomRange && !monthEnabled && year === currentYear;
}

export function calculateReportCumulativeFinancials({
  data,
  to,
  openingCashBalance,
}: {
  data: ReportFinancialData;
  to: string;
  openingCashBalance: number;
}) {
  const sales = data.sales.filter((row) => onOrBefore(row.sale_date, to));
  const saleIds = new Set(sales.map((row) => row.id));

  return calculateBusinessFinancials({
    sales,
    saleItems: data.saleItems.filter((item) => saleIds.has(item.sale_id)),
    products: data.products,
    otherIncome: data.otherIncome.filter((row) => onOrBefore(row.income_date, to)),
    expenses: data.expenses.filter((row) => onOrBefore(row.expense_date, to)),
    savings: data.savings.filter((row) => onOrBefore(row.savings_date, to)),
    investments: data.investments.filter((row) => onOrBefore(row.investment_date, to)),
    investorFunds: data.funding.filter((row) => onOrBefore(row.date_received, to)),
    restocks: data.restocks.filter((row) => onOrBefore(row.restock_date, to)),
    openingCashBalance,
  });
}
