// Builds a monthly statement dataset for ONE business.
// Tenant isolation: every query below is filtered by the target business id.
// Financial figures come from the same calculation engine the Reports page uses
// (`finance.ts` is a byte-identical copy of src/lib/sales-inventory.ts).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  calculateFinancialSnapshot,
  getPaidAmount,
  isCancelledStatus,
  isRecognizedSale,
  isRestockExpenseRow,
  normalizeText,
  toNumber,
} from "./finance.ts";

export type StatementPeriod = { period: string; start: string; end: string; label: string };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function resolvePeriod(period?: string | null): StatementPeriod {
  let year: number;
  let month: number; // 0-indexed
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    year = Number(period.slice(0, 4));
    month = Number(period.slice(5, 7)) - 1;
  } else {
    // Default = the most recently completed month.
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth();
  }
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  return {
    period: `${year}-${String(month + 1).padStart(2, "0")}`,
    start: start.toISOString(),
    end: end.toISOString(),
    label: `${MONTHS[month]} ${year}`,
  };
}

export type StatementData = {
  business: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    location: string | null;
    currency: string;
  };
  period: StatementPeriod;
  generatedAt: string;
  sales: {
    total: number;
    count: number;
    paid: number;
    unpaid: number;
    byMethod: Array<{ method: string; amount: number; count: number }>;
  };
  inventory: {
    restockCount: number;
    restockValue: number;
    unitsRestocked: number;
    unitsSold: number;
    closingStockUnits: number;
    closingStockValue: number;
    lowStockCount: number;
  };
  money: {
    otherIncome: number;
    expenses: number;
    expensesByCategory: Array<{ category: string; amount: number }>;
    restockSpending: number;
    savings: number;
    investments: number;
    investorFunds: number;
    paidSalesRevenue: number;
    cogs: number;
    totalIncome: number;
    profit: number;
    availableBusinessMoney: number;
  };
  orders: {
    total: number;
    delivered: number;
    pending: number;
    cancelled: number;
    revenue: number;
  };
};

export async function buildStatementData(
  admin: SupabaseClient,
  businessId: string,
  period: StatementPeriod,
): Promise<StatementData> {
  const { start, end } = period;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, business_name, display_name, phone, location, currency, opening_cash_balance")
    .eq("id", businessId)
    .maybeSingle();

  if (!profile) throw new Error("Business not found");

  const [salesRes, productsRes, expensesRes, incomeRes, savingsRes, investRes, fundingRes, restockRes, ordersRes] =
    await Promise.all([
      admin.from("sales").select("*").eq("user_id", businessId).gte("sale_date", start).lt("sale_date", end),
      admin.from("products").select("*").eq("user_id", businessId),
      admin.from("expenses").select("*").eq("user_id", businessId).gte("expense_date", start).lt("expense_date", end),
      admin.from("other_income").select("*").eq("user_id", businessId).gte("income_date", start).lt("income_date", end),
      admin.from("savings").select("*").eq("user_id", businessId).gte("savings_date", start).lt("savings_date", end),
      admin.from("investments").select("*").eq("user_id", businessId).gte("investment_date", start).lt("investment_date", end),
      admin.from("investor_funding").select("*").eq("user_id", businessId).gte("date_received", start).lt("date_received", end),
      admin.from("restocks").select("*").eq("user_id", businessId).gte("restock_date", start).lt("restock_date", end),
      admin.from("orders").select("*").eq("business_id", businessId).gte("order_date", start).lt("order_date", end),
    ]);

  const sales = salesRes.data ?? [];
  const saleIds = sales.map((s: any) => s.id);
  let saleItems: any[] = [];
  if (saleIds.length) {
    for (let i = 0; i < saleIds.length; i += 500) {
      const { data } = await admin
        .from("sale_items")
        .select("*")
        .eq("user_id", businessId)
        .in("sale_id", saleIds.slice(i, i + 500));
      saleItems = saleItems.concat(data ?? []);
    }
  }

  const products = (productsRes.data ?? []).map((p: any) => ({
    ...p,
    quantity: p.stock,
    cost_price: p.cost,
    selling_price: p.price,
  }));
  const expenses = expensesRes.data ?? [];
  const otherIncome = incomeRes.data ?? [];
  const savings = savingsRes.data ?? [];
  const investments = investRes.data ?? [];
  const investorFunds = fundingRes.data ?? [];
  const restocks = restockRes.data ?? [];
  const orders = ordersRes.data ?? [];

  const snapshot = calculateFinancialSnapshot({
    sales: sales as any,
    saleItems: saleItems as any,
    products: products as any,
    otherIncome: otherIncome as any,
    expenses: expenses as any,
    savings: savings as any,
    investments: investments as any,
    investorFunds: investorFunds as any,
    restocks: restocks as any,
    openingCashBalance: toNumber((profile as any).opening_cash_balance),
  });

  // Sales breakdown
  const salesTotal = sales.reduce((s: number, r: any) => s + toNumber(r.total), 0);
  const paidTotal = sales.reduce((s: number, r: any) => s + toNumber(r.amount_paid), 0);
  const methodMap = new Map<string, { amount: number; count: number }>();
  for (const s of sales as any[]) {
    const key = normalizeText(s.payment_method) || "unspecified";
    const cur = methodMap.get(key) ?? { amount: 0, count: 0 };
    cur.amount += toNumber(s.total);
    cur.count += 1;
    methodMap.set(key, cur);
  }

  const categoryMap = new Map<string, number>();
  for (const e of expenses as any[]) {
    const key = String(e.category ?? "Uncategorised");
    categoryMap.set(key, (categoryMap.get(key) ?? 0) + toNumber(e.amount));
  }

  const orderStatus = (o: any) => normalizeText(o.status);

  return {
    business: {
      id: businessId,
      name: (profile as any).business_name || (profile as any).display_name || "Your business",
      email: (profile as any).email ?? null,
      phone: (profile as any).phone ?? null,
      location: (profile as any).location ?? null,
      currency: (profile as any).currency || "GHS",
    },
    period,
    generatedAt: new Date().toISOString(),
    sales: {
      total: salesTotal,
      count: sales.length,
      paid: paidTotal,
      unpaid: Math.max(0, salesTotal - paidTotal),
      byMethod: Array.from(methodMap.entries())
        .map(([method, v]) => ({ method, ...v }))
        .sort((a, b) => b.amount - a.amount),
    },
    inventory: {
      restockCount: restocks.length,
      restockValue: restocks.reduce((s: number, r: any) => s + toNumber(r.total_cost), 0),
      unitsRestocked: restocks.reduce((s: number, r: any) => s + toNumber(r.quantity_added), 0),
      unitsSold: saleItems.reduce((s: number, r: any) => s + toNumber(r.quantity), 0),
      closingStockUnits: snapshot.stockLeft,
      closingStockValue: snapshot.stockValueCost,
      lowStockCount: snapshot.lowStockCount,
    },
    money: {
      otherIncome: snapshot.otherIncome,
      expenses: snapshot.operatingExpenses,
      expensesByCategory: Array.from(categoryMap.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
      restockSpending: snapshot.totalRestockSpending,
      savings: snapshot.totalSavings,
      investments: snapshot.totalInvestments,
      investorFunds: snapshot.investorFunds,
      paidSalesRevenue: snapshot.paidSalesRevenue,
      cogs: snapshot.cogs,
      totalIncome: snapshot.totalIncome,
      profit: snapshot.profit,
      availableBusinessMoney: snapshot.availableBusinessMoney,
    },
    orders: {
      total: orders.length,
      delivered: orders.filter((o: any) => ["delivered", "completed"].includes(orderStatus(o))).length,
      pending: orders.filter((o: any) =>
        ["pending", "processing", "confirmed", "ready_for_pickup", "out_for_delivery"].includes(orderStatus(o))
      ).length,
      cancelled: orders.filter((o: any) => orderStatus(o) === "cancelled").length,
      revenue: orders.reduce((s: number, o: any) => s + toNumber(o.total), 0),
    },
  };
}
