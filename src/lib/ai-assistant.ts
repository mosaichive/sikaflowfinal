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
import type { ModuleKey } from '@/lib/permissions';

export type AssistantActionType =
  | 'record_sale'
  | 'record_expense'
  | 'record_income'
  | 'add_customer'
  | 'restock'
  | 'add_product';

export interface AssistantAction {
  type: AssistantActionType;
  summary: string;
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

/** Loose product matcher: exact, then case-insensitive, then contains, then singular/plural. */
export function matchProduct(products: any[], name?: string | null) {
  const query = String(name || '').trim().toLowerCase();
  if (!query) return null;
  const singular = query.replace(/s$/, '');
  return (
    products.find((p) => String(p.name || '').toLowerCase() === query) ||
    products.find((p) => String(p.sku || '').toLowerCase() === query) ||
    products.find((p) => String(p.name || '').toLowerCase().includes(query)) ||
    products.find((p) => String(p.name || '').toLowerCase().replace(/s$/, '') === singular) ||
    null
  );
}

export interface AssistantExecutionContext {
  userId: string;
  ownerId: string;
  businessId: string;
  displayName: string;
  products: any[];
  allowSalesWithoutStock: boolean;
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

async function recordSale(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  const product = matchProduct(ctx.products, action.product_name);
  if (!product) return { ok: false, message: `I could not find "${action.product_name}" in your products.` };

  const quantity = Math.max(1, num(action.quantity, 1));
  const unitPrice = action.unit_price != null ? num(action.unit_price) : num(product.selling_price ?? product.price);
  if (unitPrice <= 0) return { ok: false, message: 'That product has no selling price yet. Set a price first.' };

  const unitCost = num(product.cost_price ?? product.cost);
  const total = unitPrice * quantity;
  const costTotal = unitCost * quantity;
  const available = num(product.quantity ?? product.stock);
  const shortfall = Math.max(0, quantity - Math.max(0, available));

  if (shortfall > 0 && !ctx.allowSalesWithoutStock) {
    return { ok: false, message: `Only ${available} of ${product.name} left in stock. Restock before selling ${quantity}.` };
  }

  const sale: any = await insertSaleRecord({
    user_id: ctx.ownerId,
    business_id: ctx.businessId,
    sale_date: resolveDate(action.date),
    customer_name: action.customer_name || 'Walk-in',
    customer_phone: action.customer_phone || '',
    staff_id: ctx.userId,
    staff_name: ctx.displayName,
    subtotal: total,
    discount: 0,
    total,
    amount_paid: total,
    balance: 0,
    payment_method: normalizePaymentMethod(action.payment_method),
    payment_status: 'paid',
    due_date: null,
    status: 'completed',
    sale_channel: 'pos',
    stock_status: shortfall > 0 ? 'negative_stock_sale' : 'in_stock',
    stock_shortfall: shortfall,
    notes: action.note || 'Recorded with AI Assistant',
    cost_total: costTotal,
  });

  await insertSaleItemRecord({
    user_id: ctx.ownerId,
    business_id: ctx.businessId,
    sale_id: sale.id,
    product_id: product.id,
    product_name: product.name,
    sku: product.sku,
    quantity,
    unit_price: unitPrice,
    unit_cost: unitCost,
    cost_price: unitCost,
    line_total: total,
  });

  if (action.customer_name && action.customer_name !== 'Walk-in') {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', ctx.ownerId)
      .ilike('name', action.customer_name)
      .maybeSingle();
    if (!existing) {
      await supabase
        .from('customers')
        .insert({ user_id: ctx.ownerId, name: action.customer_name, phone: action.customer_phone || null });
    }
  }

  void notifySaleThanks(sale.id);
  void notifyLowStock([product.id]);

  return { ok: true, message: `Sale recorded: ${product.name} × ${quantity}.` };
}

async function recordExpense(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  const amount = num(action.amount);
  if (amount <= 0) return { ok: false, message: 'I need a valid expense amount.' };

  await insertExpenseRecord({
    user_id: ctx.ownerId,
    business_id: ctx.businessId,
    category: normalizeCategory(action.category, EXPENSE_CATEGORIES),
    description: action.note || action.category || 'Recorded with AI Assistant',
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

async function recordIncome(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  const amount = num(action.amount);
  if (amount <= 0) return { ok: false, message: 'I need a valid income amount.' };

  const category = normalizeCategory(action.category, OTHER_INCOME_CATEGORIES);
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

async function addCustomer(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
  const name = String(action.customer_name || '').trim();
  if (!name) return { ok: false, message: 'I need the customer name.' };

  const { error } = await supabase.from('customers').insert({
    user_id: ctx.ownerId,
    name,
    phone: action.customer_phone || null,
    note: action.note || null,
  });
  if (error) throw error;

  return { ok: true, message: `${name} added to customers.` };
}

async function restockProduct(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
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

async function addProduct(action: AssistantAction, ctx: AssistantExecutionContext): Promise<ExecutionResult> {
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
