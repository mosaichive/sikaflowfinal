import { createClient } from 'jsr:@supabase/supabase-js@2.110.0';
import { aiProvider, runAssistantTurn } from '../_shared/ai-provider.ts';
import { consumeRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALL_MODULES = [
  'dashboard', 'sales', 'products', 'inventory', 'damaged_goods', 'customers',
  'orders', 'other_income', 'expenses', 'savings', 'reports', 'staff',
  'announcements', 'settings',
];
const ROLE_MODULES: Record<string, string[]> = {
  admin: ALL_MODULES,
  manager: ['dashboard', 'sales', 'products', 'inventory', 'damaged_goods', 'customers', 'orders', 'other_income', 'expenses', 'savings', 'reports', 'announcements'],
  salesperson: ['dashboard', 'sales', 'customers', 'orders', 'announcements'],
  cashier: ['dashboard', 'sales', 'customers', 'announcements'],
  distributor: ['dashboard', 'inventory', 'orders', 'announcements'],
  staff: ['dashboard', 'announcements'],
};
const ACTION_MODULE: Record<string, string> = {
  record_sale: 'sales', record_expense: 'expenses', record_income: 'other_income',
  add_customer: 'customers', restock: 'inventory', add_product: 'products',
};
const EXPENSE_CATEGORIES = [
  'Rent', 'Utilities', 'Transport', 'Salaries', 'Marketing', 'Supplies',
  'Maintenance', 'Taxes', 'Bank Charges', 'Other',
];
const INCOME_CATEGORIES = ['Service', 'Commission', 'Investment', 'Grant', 'Refund', 'Other'];

const ACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'action'],
  properties: {
    reply: { type: 'string', description: 'Short, friendly reply. Never invent numbers.' },
    action: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: [
        'type', 'summary', 'items', 'product_name', 'quantity', 'unit_price',
        'customer_name', 'customer_phone', 'amount', 'category',
        'payment_method', 'note', 'date', 'on_credit',
      ],
      properties: {
        type: { type: 'string', enum: ['record_sale', 'record_expense', 'record_income', 'add_customer', 'restock', 'add_product'] },
        summary: { type: 'string' },
        items: {
          type: ['array', 'null'],
          items: {
            type: 'object', additionalProperties: false,
            required: ['product_name', 'quantity', 'unit_price'],
            properties: {
              product_name: { type: 'string' },
              quantity: { type: ['number', 'null'] },
              unit_price: { type: ['number', 'null'] },
            },
          },
        },
        product_name: { type: ['string', 'null'] },
        quantity: { type: ['number', 'null'] },
        unit_price: { type: ['number', 'null'] },
        customer_name: { type: ['string', 'null'] },
        customer_phone: { type: ['string', 'null'] },
        amount: { type: ['number', 'null'] },
        category: { type: ['string', 'null'] },
        payment_method: { type: ['string', 'null'] },
        note: { type: ['string', 'null'] },
        date: { type: ['string', 'null'] },
        on_credit: { type: ['boolean', 'null'] },
      },
    },
  },
} as const;

type UserClient = ReturnType<typeof createClient>;

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function modulesForPermissions(permissions: unknown) {
  const value = permissions && typeof permissions === 'object'
    ? permissions as Record<string, unknown>
    : {};
  if (Array.isArray(value.modules)) {
    return value.modules.filter((module): module is string =>
      typeof module === 'string' && ALL_MODULES.includes(module));
  }
  return ROLE_MODULES[String(value.role || 'staff')] ?? ROLE_MODULES.staff;
}

async function resolveAssistantContext(supabase: UserClient, userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('business_id,business_name,currency')
    .or(`id.eq.${userId},user_id.eq.${userId}`)
    .maybeSingle();
  if (profileError) throw profileError;

  let businessId = profile?.business_id as string | null;
  let membership: any = null;
  if (!businessId) {
    const { data: ownedBusiness } = await supabase
      .from('businesses').select('id').eq('owner_user_id', userId).maybeSingle();
    businessId = ownedBusiness?.id ?? null;
  }
  if (!businessId) {
    const { data: staffMembership } = await supabase
      .from('staff_members')
      .select('business_id,permissions,active')
      .eq('staff_user_id', userId).eq('active', true).limit(1).maybeSingle();
    membership = staffMembership;
    businessId = staffMembership?.business_id ?? null;
  }
  if (!businessId) throw new Error('Finish setting up your business first.');

  const { data: business, error: businessError } = await supabase
    .from('businesses').select('id,name,owner_user_id').eq('id', businessId).single();
  if (businessError) throw businessError;

  let modules = ALL_MODULES;
  if (business.owner_user_id !== userId) {
    if (!membership) {
      const { data: staffMembership } = await supabase
        .from('staff_members').select('permissions,active')
        .eq('staff_user_id', userId).eq('business_id', businessId).eq('active', true).maybeSingle();
      membership = staffMembership;
    }
    if (membership) {
      modules = modulesForPermissions(membership.permissions);
    } else {
      const { data: roleRow } = await supabase
        .from('user_roles').select('role')
        .eq('user_id', userId).eq('business_id', businessId).maybeSingle();
      if (!roleRow) throw new Error('You do not have access to this business.');
      modules = ROLE_MODULES[String(roleRow.role)] ?? [];
    }
    if (modules.length === 0) throw new Error('You do not have access to this business.');
  }

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const [productsResult, salesResult, expensesResult, incomeResult, customerResult] = await Promise.all([
    supabase.from('products')
      .select('id,name,sku,selling_price,cost_price,quantity,low_stock_threshold,reorder_level,is_archived')
      .eq('business_id', businessId).eq('is_archived', false).order('name').limit(200),
    supabase.from('sales').select('id,total,amount_paid,sale_date')
      .eq('business_id', businessId).gte('sale_date', startOfMonth).limit(1000),
    supabase.from('expenses').select('amount,category,expense_date')
      .eq('business_id', businessId).gte('expense_date', startOfMonth).limit(1000),
    supabase.from('other_income').select('amount,income_date')
      .eq('business_id', businessId).gte('income_date', startOfMonth).limit(1000),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ]);
  for (const result of [productsResult, salesResult, expensesResult, incomeResult, customerResult]) {
    if (result.error) throw result.error;
  }

  const products = productsResult.data ?? [];
  const sales = salesResult.data ?? [];
  const expenses = expensesResult.data ?? [];
  const income = incomeResult.data ?? [];
  const todaySales = sales.filter((sale: any) => String(sale.sale_date) >= startOfToday);
  const sum = (rows: any[], field: string) => rows.reduce((total, row) => total + numberValue(row[field]), 0);

  return {
    today: now.toISOString().slice(0, 10), country: 'Ghana',
    currency: String(profile?.currency || 'GHS'),
    businessName: String(business.name || profile?.business_name || 'this business').slice(0, 160),
    modules, expenseCategories: EXPENSE_CATEGORIES, incomeCategories: INCOME_CATEGORIES,
    products: products.map((product: any) => ({
      name: String(product.name || '').slice(0, 160),
      sku: String(product.sku || '').slice(0, 80),
      price: numberValue(product.selling_price), cost: numberValue(product.cost_price),
      stock: numberValue(product.quantity),
    })),
    snapshot: {
      today: { sales_count: todaySales.length, revenue: sum(todaySales, 'total'), amount_received: sum(todaySales, 'amount_paid') },
      this_month: {
        sales_count: sales.length, revenue: sum(sales, 'total'), amount_received: sum(sales, 'amount_paid'),
        other_income: sum(income, 'amount'), expenses: sum(expenses, 'amount'),
      },
      product_count: products.length, customer_count: customerResult.count ?? 0,
      low_stock: products
        .filter((product: any) => numberValue(product.quantity) <= numberValue(product.low_stock_threshold ?? product.reorder_level ?? 5))
        .slice(0, 20).map((product: any) => ({ name: product.name, stock: numberValue(product.quantity) })),
      result_limits: { products: 200, monthly_rows_per_table: 1000 },
    },
  };
}

function systemPrompt(ctx: any) {
  const productLines = (ctx.products ?? [])
    .map((product: any) => `- ${product.name}${product.sku ? ` (${product.sku})` : ''}: price ${product.price}, cost ${product.cost}, stock ${product.stock}`)
    .join('\n');
  return `You are the KudiTrack AI Business Assistant for a small business in ${ctx.country}.
Use only the server-verified business data below. Never invent numbers, products, customers, or permissions.
Today is ${ctx.today}. Currency: ${ctx.currency}. Business: ${ctx.businessName}.

RULES
- For questions, answer from the snapshot and set action to null. Mention when row limits can make a total incomplete.
- For recording requests, return one action and say that the user must confirm before anything is saved.
- A multi-item sale is one record_sale with one items entry per product, in spoken order.
- A missing item price is null so the app uses the catalogue price. Never invent a price.
- Credit language sets on_credit true. Paid sales set it false. Other actions use null.
- If a required detail is missing or ambiguous, set action to null and ask one short question.
- Match catalogue names case-insensitively and tolerate minor speech or spelling differences.
- payment_method is cash, momo, card, or bank_transfer; default to cash.
- Allowed expense categories: ${ctx.expenseCategories.join(', ')}.
- Allowed income categories: ${ctx.incomeCategories.join(', ')}.
- Allowed modules: ${ctx.modules.join(', ')}. Refuse actions outside them.
- Keep replies under 60 words and do not expose implementation details.

PRODUCT CATALOGUE
${productLines || '(no products yet)'}

BUSINESS SNAPSHOT
${JSON.stringify(ctx.snapshot)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => null);
    if (!Array.isArray(body?.messages) || body.messages.length === 0) return json({ error: 'messages is required' }, 400);
    const messages = body.messages
      .filter((message: any) => message && typeof message.content === 'string' && (message.role === 'user' || message.role === 'assistant'))
      .slice(-12)
      .map((message: any) => ({ role: message.role, content: String(message.content).trim().slice(0, 1000) }))
      .filter((message: any) => message.content.length > 0);
    if (messages.length === 0 || messages.reduce((total: number, message: any) => total + message.content.length, 0) > 6000) {
      return json({ error: 'The conversation is too long. Start a new conversation and try again.' }, 400);
    }

    // With no provider configured, no business data leaves Supabase.
    if (aiProvider() === 'disabled') return json({ reply: '', action: null, provider_disabled: true }, 200);

    const [withinClientLimit, withinUserLimit] = await Promise.all([
      consumeRateLimit({ req, action: 'ai_assistant_client', keyScope: 'client', limit: 20, windowSeconds: 60 }),
      consumeRateLimit({ req, action: 'ai_assistant_user', entity: userData.user.id, keyScope: 'entity', limit: 40, windowSeconds: 300 }),
    ]);
    if (!withinClientLimit || !withinUserLimit) return json({ error: 'Too many assistant requests. Please wait a moment and try again.' }, 429);

    const context = await resolveAssistantContext(supabase, userData.user.id);
    const result = await runAssistantTurn({ systemPrompt: systemPrompt(context), messages, schema: ACTION_SCHEMA });
    if (!result.ok) return json({ error: result.error }, result.status);

    const action = result.action && typeof result.action === 'object' ? result.action as Record<string, unknown> : null;
    const requiredModule = action ? ACTION_MODULE[String(action.type)] : null;
    if (requiredModule && !context.modules.includes(requiredModule)) {
      return json({ reply: 'You do not have permission to use that business module.', action: null }, 200);
    }
    return json({ reply: String(result.reply).slice(0, 1000), action, provider_disabled: false }, 200);
  } catch (error) {
    console.error('[ai-assistant] request failed', { message: error instanceof Error ? error.message : 'unknown' });
    const message = error instanceof Error && /setup|access/i.test(error.message)
      ? error.message
      : 'The assistant could not load your business data right now.';
    return json({ error: message }, /access/i.test(message) ? 403 : 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
