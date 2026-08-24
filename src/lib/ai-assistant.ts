import { supabase } from '@/integrations/supabase/client';
import {
  insertSaleRecord,
  insertSaleItemRecord,
  insertExpenseRecord,
  insertRestockRecord,
  loadProductsCompat,
} from '@/lib/workspace';
import { recomputeProductStock } from '@/lib/sale-items-schema';
import { notifyLowStock, notifySaleThanks } from '@/lib/sms-notifications';
import { EXPENSE_CATEGORIES, OTHER_INCOME_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants';
import { enqueueOperation } from '@/lib/offline-sync';
import { recordSaleOffline } from '@/lib/offline-sale';
import { matchProduct, matchProductCandidates } from '@/lib/product-match';
import type { ModuleKey } from '@/lib/permissions';

export { matchProduct, matchProductCandidates };

export type AssistantActionType =
  | 'record_sale'
  | 'record_expense'
  | 'record_income'
  | 'add_customer'
  | 'restock'
  | 'add_product';

export interface AssistantSaleItem {
  product_name?: string | null;
  quantity?: number | null;
  /** Null means "use the catalogue price" — totals are always computed in app code. */
  unit_price?: number | null;
}

export interface AssistantAction {
  type: AssistantActionType;
  summary: string;
  /** Multi-item support: one entry per product in a sale. Falls back to the single fields. */
  items?: AssistantSaleItem[] | null;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  amount?: number | null;
  category?: string | null;
  payment_method?: string | null;
  note?: string | null;
  date?: string | null;
  /** True when the customer has not paid yet (credit sale). */
  on_credit?: boolean | null;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: AssistantAction | null;
  actionState?: 'pending' | 'done' | 'cancelled';
}

export const ACTION_MODULE: Record<AssistantActionType, ModuleKey> = {
  record_sale: 'sales',
  record_expense: 'expenses',
  record_income: 'other_income',
  add_customer: 'customers',
  restock: 'inventory',
  add_product: 'products',
};

export const ACTION_LABEL: Record<AssistantActionType, string> = {
  record_sale: 'Record sale',
  record_expense: 'Record expense',
  record_income: 'Record other income',
  add_customer: 'Add customer',
  restock: 'Restock product',
  add_product: 'Add product',
};

const VALID_PAYMENT_METHODS = PAYMENT_METHODS.map((m) => m.value) as string[];

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizePaymentMethod(value?: string | null) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (VALID_PAYMENT_METHODS.includes(raw)) return raw;
  if (raw.includes('momo') || raw.includes('mobile')) return 'momo';
  if (raw.includes('bank') || raw.includes('transfer')) return 'bank_transfer';
  if (raw.includes('card')) return 'card';
  return 'cash';
}

function normalizeCategory(value: string | null | undefined, allowed: readonly string[]) {
  const raw = String(value || '').trim().toLowerCase();
  const match = allowed.find((c) => c.toLowerCase() === raw);
  if (match) return match;
  const partial = allowed.find((c) => raw && (c.toLowerCase().includes(raw) || raw.includes(c.toLowerCase())));
  return partial ?? allowed[allowed.length - 1];
}

function resolveDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export interface AssistantExecutionContext {
  userId: string;
  ownerId: string;
  businessId: string;
  displayName: string;
  products: any[];
  allowSalesWithoutStock: boolean;
  /** When true, actions are queued on-device and sync later via the offline engine. */
  offline?: boolean;
}

export interface ExecutionResult {
  ok: boolean;
  message: string;
}

export async function executeAssistantAction(
  action: AssistantAction,
  ctx: AssistantExecutionContext,
): Promise<ExecutionResult> {
  switch (action.type) {
    case 'record_sale':
      return recordSale(action, ctx);
    case 'record_expense':
      return recordExpense(action, ctx);
    case 'record_income':
      return recordIncome(action, ctx);
    case 'add_customer':
      return addCustomer(action, ctx);
    case 'restock':
      return restockProduct(action, ctx);
    case 'add_product':
      return addProduct(action, ctx);
    default:
      return { ok: false, message: 'That action is not supported yet.' };
  }
}

/* ------------------------------------------------------------------ sales */

interface ResolvedLine {
  product: any;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  lineTotal: number;
  shortfall: number;
}

/**
 * Resolves every requested line against the catalogue. Each item is matched
 * independently, prices default to the catalogue price, and totals are always
 * computed here — never taken from the AI.
 */
function resolveSaleLines(
  action: AssistantAction,
  ctx: AssistantExecutionContext,
): { lines: ResolvedLine[] } | { error: string } {
  const rawItems = (
    Array.isArray(action.items) && action.items.length > 0
      ? action.items
      : [{ product_name: action.product_name, quantity: action.quantity, unit_price: action.unit_price }]
  ).filter((item) => String(item?.product_name || '').trim());

  if (rawItems.length === 0) return { error: 'I need at least one product to record a sale.' };

  const lines: ResolvedLine[] = [];
  const unmatched: string[] = [];

  for (const item of rawItems) {
    const product = matchProduct(ctx.products, item.product_name);
    if (!product) {
      unmatched.push(String(item.product_name));
      continue;
    }
    const quantity = Math.max(1, num(item.quantity, 1));
    const unitPrice = item.unit_price != null ? num(item.unit_price) : num(product.selling_price ?? product.price);
    if (unitPrice <= 0) {
      return { error: `"${product.name}" has no selling price yet. Set a price on the product first.` };
    }
    const unitCost = num(product.cost_price ?? product.cost);
    const available = num(product.quantity ?? product.stock);
    const shortfall = Math.max(0, quantity - Math.max(0, available));
    lines.push({ product, quantity, unitPrice, unitCost, lineTotal: round2(unitPrice * quantity), shortfall });
  }

  if (unmatched.length > 0) {
    const details = unmatched.map((name) => {
      const suggestions = matchProductCandidates(ctx.products, name)
        .slice(0, 3)
        .map((c) => c.product?.name)
        .filter(Boolean);
      return suggestions.length ? `"${name}" (did you mean ${suggestions.join(' or ')}?)` : `"${name}"`;
    });
    return { error: `I could not find ${details.join(', ')} in your products. Nothing was saved — adjust the items and try again.` };
  }

  if (!ctx.allowSalesWithoutStock) {
    const blocked = lines.filter((line) => line.shortfall > 0);
    if (blocked.length > 0) {
      const detail = blocked
        .map((line) => `only ${num(line.product.quantity ?? line.product.stock)} of ${line.product.name} left`)
        .join('; ');
      return { error: `Not enough stock: ${detail}. Restock before saving this sale.` };
    }
  }

  return { lines };
}

async function recordSale(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  const resolved = resolveSaleLines(action, ctx);
  if ('error' in resolved) return { ok: false, message: resolved.error };
  const { lines } = resolved;

  const total = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const costTotal = round2(lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0));
  const onCredit = Boolean(action.on_credit);
  const amountPaid = onCredit ? 0 : total;
  const balance = round2(Math.max(0, total - amountPaid));
  const paymentStatus = onCredit ? 'unpaid' : 'paid';
  const customerName = String(action.customer_name || '').trim() || 'Walk-in';
  const shortfall = lines.reduce((sum, line) => sum + line.shortfall, 0);
  const label = lines.map((line) => `${line.product.name} × ${line.quantity}`).join(', ');

  if (ctx.offline) {
    await recordSaleOffline({
      ownerId: ctx.ownerId,
      businessId: ctx.businessId,
      customerName,
      customerPhone: action.customer_phone || null,
      staffName: ctx.displayName,
      saleDate: resolveDate(action.date),
      dueDate: null,
      subtotal: total,
      discount: 0,
      total,
      costTotal,
      amountPaid,
      balance,
      paymentMethod: normalizePaymentMethod(action.payment_method),
      paymentStatus,
      notes: action.note || 'Recorded with AI Assistant (offline)',
      items: lines.map((line) => ({
        product_id: line.product.id,
        product_name: line.product.name,
        sku: line.product.sku ?? null,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        unit_cost: line.unitCost,
        line_total: line.lineTotal,
      })),
    });
    return {
      ok: true,
      message: `Sale saved on this device (${label}) — it will sync automatically when you're back online.`,
    };
  }

  const sale: any = await insertSaleRecord({
    user_id: ctx.ownerId,
    business_id: ctx.businessId,
    sale_date: resolveDate(action.date),
    customer_name: customerName,
    customer_phone: action.customer_phone || '',
    staff_id: ctx.userId,
    staff_name: ctx.displayName,
    subtotal: total,
    discount: 0,
    total,
    amount_paid: amountPaid,
    balance,
    payment_method: normalizePaymentMethod(action.payment_method),
    payment_status: paymentStatus,
    due_date: null,
    status: 'completed',
    sale_channel: 'pos',
    stock_status: shortfall > 0 ? 'negative_stock_sale' : 'in_stock',
    stock_shortfall: shortfall,
    notes: action.note || 'Recorded with AI Assistant',
    cost_total: costTotal,
  });

  for (const line of lines) {
    await insertSaleItemRecord({
      user_id: ctx.ownerId,
      business_id: ctx.businessId,
      sale_id: sale.id,
      product_id: line.product.id,
      product_name: line.product.name,
      sku: line.product.sku,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      unit_cost: line.unitCost,
      cost_price: line.unitCost,
      line_total: line.lineTotal,
    });
  }

  if (customerName !== 'Walk-in') {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', ctx.ownerId)
      .ilike('name', customerName)
      .maybeSingle();
    if (!existing) {
      await supabase
        .from('customers')
        .insert({ user_id: ctx.ownerId, name: customerName, phone: action.customer_phone || null });
    }
  }

  void notifySaleThanks(sale.id);
  void notifyLowStock(lines.map((line) => line.product.id));

  return {
    ok: true,
    message: `Sale recorded: ${label}${onCredit ? ' (on credit — unpaid)' : ''}.`,
  };
}

/* ---------------------------------------------------------------- expense */

async function recordExpense(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  const amount = num(action.amount);
  if (amount <= 0) return { ok: false, message: 'I need a valid expense amount.' };

  const category = normalizeCategory(action.category, EXPENSE_CATEGORIES);
  const description = action.note || action.category || 'Recorded with AI Assistant';

  if (ctx.offline) {
    await enqueueOperation({
      kind: 'expense',
      ownerId: ctx.ownerId,
      businessId: ctx.businessId,
      amount,
      label: `Expense — ${category}`,
      payload: {
        amount,
        category,
        description,
        note: action.note || description,
        payment_method: normalizePaymentMethod(action.payment_method),
        expense_date: resolveDate(action.date),
        recorded_by_name: ctx.displayName,
      },
    });
    return { ok: true, message: 'Expense saved on this device — it will sync when you reconnect.' };
  }

  await insertExpenseRecord({
    user_id: ctx.ownerId,
    business_id: ctx.businessId,
    category,
    description,
    amount,
    expense_date: resolveDate(action.date),
    payment_method: normalizePaymentMethod(action.payment_method),
    attachment_path: null,
    attachment_name: null,
    recorded_by: ctx.userId,
    recorded_by_name: ctx.displayName,
  });

  return { ok: true, message: 'Expense recorded.' };
}

/* ----------------------------------------------------------------- income */

async function recordIncome(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  const amount = num(action.amount);
  if (amount <= 0) return { ok: false, message: 'I need a valid income amount.' };

  const category = normalizeCategory(action.category, OTHER_INCOME_CATEGORIES);

  if (ctx.offline) {
    await enqueueOperation({
      kind: 'income',
      ownerId: ctx.ownerId,
      businessId: ctx.businessId,
      amount,
      label: `Income — ${category}`,
      payload: {
        amount,
        source: category,
        category,
        description: action.note || category,
        note: action.note || category,
        payment_method: normalizePaymentMethod(action.payment_method),
        income_date: resolveDate(action.date),
        recorded_by_name: ctx.displayName,
      },
    });
    return { ok: true, message: 'Income saved on this device — it will sync when you reconnect.' };
  }

  const { error } = await supabase.from('other_income' as any).insert({
    user_id: ctx.ownerId,
    source: category,
    category,
    amount,
    income_date: resolveDate(action.date),
    payment_method: normalizePaymentMethod(action.payment_method),
    description: action.note || category,
    note: action.note || category,
    recorded_by: ctx.userId,
    recorded_by_name: ctx.displayName,
  });
  if (error) throw error;

  return { ok: true, message: 'Other income recorded.' };
}

/* -------------------------------------------------------------- customers */

async function addCustomer(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  const name = String(action.customer_name || '').trim();
  if (!name) return { ok: false, message: 'I need the customer name.' };

  if (ctx.offline) {
    await enqueueOperation({
      kind: 'customer',
      ownerId: ctx.ownerId,
      businessId: ctx.businessId,
      label: `New customer: ${name}`,
      payload: { name, phone: action.customer_phone || null, note: action.note || null },
    });
    return { ok: true, message: `${name} saved on this device — the customer will sync when you reconnect.` };
  }

  const { error } = await supabase.from('customers').insert({
    user_id: ctx.ownerId,
    name,
    phone: action.customer_phone || null,
    note: action.note || null,
  });
  if (error) throw error;

  return { ok: true, message: `${name} added to customers.` };
}

/* ----------------------------------------------------------------- restock */

async function restockProduct(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  if (ctx.offline) {
    return {
      ok: false,
      message: 'Restocking needs an internet connection — stock levels have to be checked against the server. Please reconnect and try again.',
    };
  }

  const product = matchProduct(ctx.products, action.product_name);
  if (!product) return { ok: false, message: `I could not find "${action.product_name}" in your products.` };

  const quantity = Math.max(1, num(action.quantity, 1));
  const unitCost = action.unit_price != null ? num(action.unit_price) : num(product.cost_price ?? product.cost);

  await insertRestockRecord({
    user_id: ctx.ownerId,
    business_id: ctx.businessId,
    product_id: product.id,
    product_name: product.name,
    sku: product.sku || '',
    category: product.category || '',
    quantity_added: quantity,
    cost_price_per_unit: unitCost,
    total_cost: unitCost * quantity,
    restock_date: resolveDate(action.date),
    recorded_by: ctx.userId,
    recorded_by_name: ctx.displayName,
    payment_method: normalizePaymentMethod(action.payment_method),
    note: action.note || 'Recorded with AI Assistant',
    reference: null,
    status: 'active',
    is_opening_stock: false,
  });

  await recomputeProductStock();

  return { ok: true, message: `Restocked ${product.name} by ${quantity}.` };
}

/* ---------------------------------------------------------------- products */

async function addProduct(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  if (ctx.offline) {
    return {
      ok: false,
      message: 'Adding a new product needs an internet connection. Please reconnect and try again.',
    };
  }

  const name = String(action.product_name || '').trim();
  if (!name) return { ok: false, message: 'I need a product name.' };
  const price = num(action.unit_price ?? action.amount);
  if (price <= 0) return { ok: false, message: 'I need a selling price for the product.' };

  const { error } = await supabase.from('products').insert({
    user_id: ctx.ownerId,
    name,
    price,
    cost: 0,
    stock: num(action.quantity),
    category: action.category || 'General',
  });
  if (error) throw error;

  return { ok: true, message: `${name} added to your products.` };
}

/* ----------------------------------------------------------------- context */

/** Builds the read-only business snapshot the assistant reasons over. */
export async function buildAssistantContext(params: {
  ownerId: string;
  businessId: string;
  businessName: string;
  currency: string;
  modules: string[];
}) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [productsRes, salesRes, expensesRes, incomeRes, customersRes] = await Promise.allSettled([
    loadProductsCompat(false, params.businessId),
    supabase.from('sales').select('id, total, cost_total, amount_paid, sale_date, customer_name').gte('sale_date', startOfMonth),
    supabase.from('expenses').select('amount, category, expense_date').gte('expense_date', startOfMonth),
    supabase.from('other_income').select('amount, income_date').gte('income_date', startOfMonth),
    supabase.from('customers').select('id, name').limit(200),
  ]);

  const products = productsRes.status === 'fulfilled' ? (productsRes.value as any[]) : [];
  const sales = salesRes.status === 'fulfilled' ? ((salesRes.value as any).data ?? []) : [];
  const expenses = expensesRes.status === 'fulfilled' ? ((expensesRes.value as any).data ?? []) : [];
  const income = incomeRes.status === 'fulfilled' ? ((incomeRes.value as any).data ?? []) : [];
  const customers = customersRes.status === 'fulfilled' ? ((customersRes.value as any).data ?? []) : [];

  const todaySales = sales.filter((s: any) => s.sale_date >= startOfToday);
  const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + num(row[key]), 0);

  const monthRevenue = sum(sales, 'total');
  const monthCogs = sum(sales, 'cost_total');
  const monthExpenses = sum(expenses, 'amount');
  const monthIncome = sum(income, 'amount');

  const lowStock = products
    .filter((p: any) => num(p.quantity ?? p.stock) <= num(p.low_stock_threshold ?? p.reorder_level))
    .slice(0, 20)
    .map((p: any) => ({ name: p.name, stock: num(p.quantity ?? p.stock) }));

  return {
    today: now.toISOString().slice(0, 10),
    currency: params.currency,
    businessName: params.businessName,
    modules: params.modules,
    expenseCategories: [...EXPENSE_CATEGORIES],
    incomeCategories: [...OTHER_INCOME_CATEGORIES],
    products: products.map((p: any) => ({
      name: p.name,
      sku: p.sku || '',
      price: num(p.selling_price ?? p.price),
      cost: num(p.cost_price ?? p.cost),
      stock: num(p.quantity ?? p.stock),
    })),
    snapshot: {
      today: {
        sales_count: todaySales.length,
        revenue: sum(todaySales, 'total'),
        profit_estimate: sum(todaySales, 'total') - sum(todaySales, 'cost_total'),
      },
      this_month: {
        sales_count: sales.length,
        revenue: monthRevenue,
        cost_of_goods_sold: monthCogs,
        other_income: monthIncome,
        expenses: monthExpenses,
        profit_estimate: monthRevenue - monthCogs - monthExpenses + monthIncome,
      },
      product_count: products.length,
      customer_count: customers.length,
      low_stock: lowStock,
      recent_customers: customers.slice(0, 15).map((c: any) => c.name),
    },
  };
}
