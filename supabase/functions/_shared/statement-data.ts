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

export type StatementLedgerRow = {
  date: string;
  reference: string;
  type: string;
  description: string;
  moneyIn: number;
  moneyOut: number;
  runningBalance: number;
};

export type StatementData = {
  business: {
    id: string;
    ownerUserId: string;
    name: string;
    ownerName: string;
    email: string | null;
    phone: string | null;
    location: string | null;
    currency: string;
    currencySymbol: string;
  };
  period: StatementPeriod;
  generatedAt: string;
  statement: {
    rows: StatementLedgerRow[];
    openingBalance: number;
    closingBalance: number;
    totalMoneyIn: number;
    totalMoneyOut: number;
    openingStockValue: number;
  };
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
  businessSelector: string,
  period: StatementPeriod,
): Promise<StatementData> {
  const { start, end } = period;

  let { data: business } = await admin
    .from("businesses")
    .select("id, owner_user_id, name, location, phone")
    .eq("id", businessSelector)
    .maybeSingle();
  if (!business) {
    const result = await admin
      .from("businesses")
      .select("id, owner_user_id, name, location, phone")
      .eq("owner_user_id", businessSelector)
      .limit(1)
      .maybeSingle();
    business = result.data;
  }
  if (!business?.id || !business.owner_user_id) throw new Error("Business not found");
  const businessId = business.id as string;
  const ownerUserId = business.owner_user_id as string;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, business_name, display_name, phone, location, currency, opening_cash_balance")
    .eq("user_id", ownerUserId)
    .maybeSingle();

  if (!profile) throw new Error("Business not found");

  const [salesRes, productsRes, expensesRes, incomeRes, savingsRes, investRes, fundingRes, restockRes, ordersRes] =
    await Promise.all([
      admin.from("sales").select("*").eq("business_id", businessId).gte("sale_date", start).lt("sale_date", end),
      admin.from("products").select("*").eq("business_id", businessId),
      admin.from("expenses").select("*").eq("business_id", businessId).gte("expense_date", start).lt("expense_date", end),
      admin.from("other_income").select("*").eq("business_id", businessId).gte("income_date", start).lt("income_date", end),
      admin.from("savings").select("*").eq("business_id", businessId).gte("savings_date", start).lt("savings_date", end),
      admin.from("investments").select("*").eq("business_id", businessId).gte("investment_date", start).lt("investment_date", end),
      admin.from("investor_funding").select("*").eq("business_id", businessId).gte("date_received", start).lt("date_received", end),
      admin.from("restocks").select("*").eq("business_id", businessId).gte("restock_date", start).lt("restock_date", end),
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
        .eq("business_id", businessId)
        .in("sale_id", saleIds.slice(i, i + 500));
      saleItems = saleItems.concat(data ?? []);
    }
  }

  const [movementsRes, currencyRes, priorSalesRes, priorExpensesRes, priorIncomeRes, priorSavingsRes, priorInvestRes, priorFundingRes, priorRestockRes] =
    await Promise.all([
      admin.from("stock_movements").select("*").eq("business_id", businessId)
        .gte("movement_date", start).lt("movement_date", end),
      admin.from("currencies").select("code, symbol")
        .eq("code", (profile as any).currency || "GHS").maybeSingle(),
      admin.from("sales").select("*").eq("business_id", businessId).lt("sale_date", start),
      admin.from("expenses").select("*").eq("business_id", businessId).lt("expense_date", start),
      admin.from("other_income").select("amount").eq("business_id", businessId).lt("income_date", start),
      admin.from("savings").select("amount").eq("business_id", businessId).lt("savings_date", start),
      admin.from("investments").select("amount").eq("business_id", businessId).lt("investment_date", start),
      admin.from("investor_funding").select("amount").eq("business_id", businessId).lt("date_received", start),
      admin.from("restocks").select("total_cost, status, is_opening_stock").eq("business_id", businessId).lt("restock_date", start),
    ]);

  const products = (productsRes.data ?? []).map((p: any) => ({
    ...p,
    quantity: p.stock,
    cost_price: p.cost_price,
    selling_price: p.selling_price,
  }));
  const expenses = expensesRes.data ?? [];
  const otherIncome = incomeRes.data ?? [];
  const savings = savingsRes.data ?? [];
  const investments = investRes.data ?? [];
  const investorFunds = fundingRes.data ?? [];
  const restocks = restockRes.data ?? [];
  const orders = ordersRes.data ?? [];
  const openingStockMovements = (movementsRes.data ?? []).filter(
    (m: any) => normalizeText(m.movement_type) === "opening_stock",
  );

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

  // ---- Transaction ledger (mirrors the in-app Report Slip exactly)
  const ref = (prefix: string, value: any, id: any) =>
    value && String(value).trim() ? String(value) : `${prefix}-${String(id ?? "").slice(0, 8).toUpperCase()}`;
  const ts = (value: any) => {
    const n = new Date(value ?? "").getTime();
    return Number.isFinite(n) ? n : 0;
  };
  const deductibleRestocks = (rows: any[]) =>
    rows.filter((r) => !isCancelledStatus(r.status) && r.is_opening_stock !== true);

  const ledger = [
    ...openingStockMovements.map((m: any) => ({
      date: m.movement_date,
      timestamp: ts(m.movement_date),
      reference: ref("OPN", m.reference, m.id),
      type: "Opening Stock",
      description: [m.note, "Not deducted from available money"].filter(Boolean).join(" • ") || "Opening stock",
      moneyIn: 0,
      moneyOut: 0,
    })),
    ...(sales as any[]).filter((s) => isRecognizedSale(s)).map((s: any) => ({
      date: s.sale_date,
      timestamp: ts(s.sale_date),
      reference: ref("SAL", s.reference, s.id),
      type: "Sale",
      description: [s.customer_name || "Walk-in", s.payment_status ? `Payment ${String(s.payment_status).toUpperCase()}` : ""]
        .filter(Boolean).join(" • "),
      moneyIn: getPaidAmount(s),
      moneyOut: 0,
    })),
    ...(expenses as any[]).filter((e) => !isRestockExpenseRow(e)).map((e: any) => ({
      date: e.expense_date,
      timestamp: ts(e.expense_date),
      reference: ref("EXP", e.reference, e.id),
      type: "Expense",
      description: [e.category, e.description].filter(Boolean).join(" • ") || "Expense",
      moneyIn: 0,
      moneyOut: toNumber(e.amount),
    })),
    ...(otherIncome as any[]).map((r: any) => ({
      date: r.income_date,
      timestamp: ts(r.income_date),
      reference: ref("OTH", r.reference, r.id),
      type: "Other Income",
      description: [r.category, r.description, r.payment_method ? String(r.payment_method).replaceAll("_", " ") : ""]
        .filter(Boolean).join(" • ") || "Other income",
      moneyIn: toNumber(r.amount),
      moneyOut: 0,
    })),
    ...(savings as any[]).map((r: any) => ({
      date: r.savings_date,
      timestamp: ts(r.savings_date),
      reference: ref("SAV", r.reference, r.id),
      type: "Savings",
      description: [r.source, r.note].filter(Boolean).join(" • ") || "Savings transfer",
      moneyIn: 0,
      moneyOut: toNumber(r.amount),
    })),
    ...(investments as any[]).map((r: any) => ({
      date: r.investment_date,
      timestamp: ts(r.investment_date),
      reference: ref("INV", r.reference, r.id),
      type: "Investment",
      description: [r.investment_name, r.status].filter(Boolean).join(" • ") || "Investment",
      moneyIn: 0,
      moneyOut: toNumber(r.amount),
    })),
    ...(investorFunds as any[]).map((r: any) => ({
      date: r.date_received,
      timestamp: ts(r.date_received),
      reference: ref("FND", r.reference, r.id),
      type: "Investor Funds",
      description: [r.investor_name, r.investment_type].filter(Boolean).join(" • ") || "Investor funding",
      moneyIn: toNumber(r.amount),
      moneyOut: 0,
    })),
    ...deductibleRestocks(restocks as any[]).map((r: any) => ({
      date: r.restock_date,
      timestamp: ts(r.restock_date),
      reference: ref("RST", r.reference, r.id),
      type: "Inventory Purchase (Restock)",
      description: [r.product_name, r.supplier, "Deducted from available money"].filter(Boolean).join(" • ")
        || "Inventory purchase",
      moneyIn: 0,
      moneyOut: toNumber(r.total_cost),
    })),
  ].sort((a, b) => a.timestamp - b.timestamp || a.reference.localeCompare(b.reference));

  const priorSales = (priorSalesRes.data ?? []) as any[];
  const priorExpenses = (priorExpensesRes.data ?? []) as any[];
  const openingBalance =
    toNumber((profile as any).opening_cash_balance) +
    priorSales.reduce((s, r) => s + (isRecognizedSale(r) ? getPaidAmount(r) : 0), 0) +
    (priorIncomeRes.data ?? []).reduce((s: number, r: any) => s + toNumber(r.amount), 0) +
    (priorFundingRes.data ?? []).reduce((s: number, r: any) => s + toNumber(r.amount), 0) -
    priorExpenses.reduce((s, r) => s + (isRestockExpenseRow(r) ? 0 : toNumber(r.amount)), 0) -
    (priorSavingsRes.data ?? []).reduce((s: number, r: any) => s + toNumber(r.amount), 0) -
    (priorInvestRes.data ?? []).reduce((s: number, r: any) => s + toNumber(r.amount), 0) -
    deductibleRestocks((priorRestockRes.data ?? []) as any[]).reduce((s, r) => s + toNumber(r.total_cost), 0);

  let running = openingBalance;
  const ledgerRows: StatementLedgerRow[] = ledger.map((row) => {
    running += row.moneyIn - row.moneyOut;
    return {
      date: row.date,
      reference: row.reference,
      type: row.type,
      description: row.description,
      moneyIn: row.moneyIn,
      moneyOut: row.moneyOut,
      runningBalance: running,
    };
  });
  const totalMoneyIn = ledgerRows.reduce((s, r) => s + r.moneyIn, 0);
  const totalMoneyOut = ledgerRows.reduce((s, r) => s + r.moneyOut, 0);
  const openingStockValue = openingStockMovements.reduce(
    (s: number, m: any) => s + Math.max(0, toNumber(m.quantity_change)) * Math.max(0, toNumber(m.unit_cost)),
    0,
  );

  return {
    business: {
      id: businessId,
      ownerUserId,
      name: (profile as any).business_name || business.name || (profile as any).display_name || "Your business",
      ownerName: (profile as any).display_name || (profile as any).email || "KudiTrack User",
      email: (profile as any).email ?? null,
      phone: (profile as any).phone ?? business.phone ?? null,
      location: (profile as any).location ?? business.location ?? null,
      currency: (profile as any).currency || "GHS",
      currencySymbol: (currencyRes.data as any)?.symbol || (profile as any).currency || "GHS",
    },
    period,
    generatedAt: new Date().toISOString(),
    statement: {
      rows: ledgerRows,
      openingBalance,
      closingBalance: openingBalance + totalMoneyIn - totalMoneyOut,
      totalMoneyIn,
      totalMoneyOut,
      openingStockValue,
    },
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
