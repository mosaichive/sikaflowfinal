import { EXPENSE_CATEGORIES, OTHER_INCOME_CATEGORIES, formatCurrency } from '@/lib/constants';
import { matchProductCandidates, isAmbiguousMatch, MATCH_THRESHOLD } from '@/lib/product-match';
import type { AssistantAction } from '@/lib/ai-assistant';

/**
 * Offline command parser for the AI Business Assistant.
 *
 * When there is no connection (or the edge function is unreachable) the
 * assistant falls back to this deterministic parser. It works purely against
 * data cached on the device (IndexedDB product/customer catalogues and the
 * local unsynced sales), returns the same structured AssistantAction the
 * online path returns, and every write still goes through the confirmation
 * card and the idempotent sync queue.
 */

export interface OfflineParseContext {
  products: any[];
  customers?: any[];
  localSales?: Array<{ createdAt?: number; snapshot?: Record<string, any> }>;
  currency?: string | null;
}

export type OfflineParseResult =
  | { kind: 'action'; action: AssistantAction; reply: string }
  | { kind: 'reply'; reply: string };

const QUESTION_START = /^(how|what|which|when|who|whom|do|does|did|is|are|any|can|could|show|tell|list|give)\b/i;
const CUSTOMER_INTENT = /\b(add|new|save|register|create)\s+(a\s+)?customer\b/i;
const RESTOCK_INTENT = /\b(restock|add\s+stock|received?\s+stock|stock\s+(came|has\s+come)\s+in|bought\s+stock)\b/i;
const SALE_INTENT = /\b(sold|sell|sale)\b/i;
const EXPENSE_INTENT = /\b(spent|spend|expense|paid\s+for|paid\s+\d|payment\s+for|bought)\b/i;
const INCOME_INTENT = /\b(received|receive|got\s+paid|income|earned|someone\s+paid\s+me)\b/i;
const CREDIT_RE = /\b(on\s+credit|credit|hasn'?t\s+paid|not\s+paid|will\s+pay\s+later|pays?\s+later|owes?(\s+me)?|debt|pay\s+later)\b/i;

const OFFLINE_CAPABILITIES =
  'I can record sales (even several items at once), expenses, income and new customers, or tell you about low stock and sales saved on this device. For reports and everything else, please reconnect.';

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function preprocess(raw: string) {
  return String(raw)
    .replace(/(\d),(?=\d)/g, '$1') // 5,000 -> 5000
    .replace(/₵/g, ' ')
    .replace(/\b(ghs|ghc|cedis?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectPaymentMethod(text: string) {
  if (/\b(momo|mobile\s+money|mtn|telecel|vodafone|voda)\b/i.test(text)) return 'momo';
  if (/\b(bank|transfer)\b/i.test(text)) return 'bank_transfer';
  if (/\bcard\b/i.test(text)) return 'card';
  return 'cash';
}

/** Extracts a phone number (9–13 digits) and returns [textWithoutPhone, phone]. */
function extractPhone(text: string): [string, string | null] {
  const match = text.match(/\+?\d[\d\s-]{7,16}\d/);
  if (!match || match.index == null) return [text, null];
  const digits = match[0].replace(/\D/g, '');
  if (digits.length < 9 || digits.length > 13) return [text, null];
  const cleaned = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
  return [cleaned.replace(/\s+/g, ' ').trim(), digits];
}

/** Removes payment/credit phrasing so it can't confuse item parsing. */
function stripPaymentPhrases(text: string) {
  return text
    .replace(
      /\b(on\s+credit|by\s+(cash|momo|mobile\s+money|card|bank(\s+transfer)?)|via\s+(cash|momo|mobile\s+money|card|bank(\s+transfer)?)|paid\s+(by|with|in)?\s*(cash|momo|mobile\s+money|card|bank(\s+transfer)?)?|in\s+cash|will\s+pay\s+later|pays?\s+later|owes?(\s+me)?|not\s+paid|hasn'?t\s+paid)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ sales */

function summarizeSale(
  items: Array<{ product_name: string; quantity: number }>,
  customer: string | null,
  onCredit: boolean,
) {
  const lines = items.map((item) => `${item.product_name} × ${item.quantity}`).join(', ');
  const extras = [customer ? `for ${customer}` : null, onCredit ? 'on credit' : null].filter(Boolean).join(', ');
  return `Sale — ${lines}${extras ? ` (${extras})` : ''}`;
}

function parseSale(original: string, ctx: OfflineParseContext): OfflineParseResult {
  let text = preprocess(original);

  const onCredit = CREDIT_RE.test(text) && !/credit\s+card/i.test(text);
  const payment = detectPaymentMethod(text);

  const [withoutPhone, phone] = extractPhone(text);
  text = stripPaymentPhrases(withoutPhone);

  // Customer: trailing "to NAME" clause (after payment phrases are stripped).
  let customer: string | null = null;
  const toMatch = text.match(/\bto\s+([a-zA-Z][a-zA-Z'.-]*(?:\s+[a-zA-Z][a-zA-Z'.-]*){0,3})\s*$/i);
  if (toMatch && toMatch.index != null) {
    customer = titleCase(toMatch[1].replace(/\s+and\s+.*$/i, '').trim());
    text = text.slice(0, toMatch.index).trim();
  }

  const segments = text
    .split(/[,;]|\band\b|\balso\b|\bplus\b|\bthen\b/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const items: Array<{ product_name: string; quantity: number; unit_price: number | null }> = [];
  const problems: string[] = [];

  for (const rawSegment of segments) {
    let segment = rawSegment
      .replace(/^\s*(i\s+)?(just\s+)?(sold|sell|sale(\s+of)?|record(\s+a)?(\s+sale(\s+of)?)?)\s+/i, '')
      .trim();
    if (!segment) continue;

    let price: number | null = null;
    const priceMatch = segment.match(/(?:at|@|for|each)\s*(\d+(?:\.\d+)?)/i);
    if (priceMatch && priceMatch.index != null) {
      price = Number(priceMatch[1]);
      segment = `${segment.slice(0, priceMatch.index)} ${segment.slice(priceMatch.index + priceMatch[0].length)}`.trim();
    }

    let quantity = 1;
    const qtyMatch = segment.match(/(\d+(?:\.\d+)?)/);
    if (qtyMatch && qtyMatch.index != null) {
      quantity = Math.max(1, Number(qtyMatch[1]) || 1);
      segment = `${segment.slice(0, qtyMatch.index)} ${segment.slice(qtyMatch.index + qtyMatch[0].length)}`.trim();
    }

    const cleaned = segment
      .replace(/\b(pcs?|pieces?|units?|items?|of|the|a|an)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) continue;

    const candidates = matchProductCandidates(ctx.products, cleaned);
    const best = candidates[0];

    if (!best || best.score < MATCH_THRESHOLD) {
      const suggestions = candidates
        .slice(0, 3)
        .map((candidate) => candidate.product?.name)
        .filter(Boolean);
      problems.push(
        suggestions.length
          ? `I couldn't find "${cleaned}" — did you mean ${suggestions.join(' or ')}?`
          : `I couldn't find "${cleaned}" in your products.`,
      );
      continue;
    }

    if (isAmbiguousMatch(candidates)) {
      const options = candidates
        .slice(0, 3)
        .map((candidate) => candidate.product?.name)
        .filter(Boolean);
      problems.push(`For "${cleaned}", did you mean ${options.join(' or ')}?`);
      continue;
    }

    items.push({ product_name: String(best.product.name), quantity, unit_price: price });
  }

  if (items.length === 0) {
    return {
      kind: 'reply',
      reply:
        problems.join(' ') ||
        `I couldn't work out which products you sold. Try something like "Sold 2 ${ctx.products[0]?.name ?? 'items'} at 50".`,
    };
  }

  const action: AssistantAction = {
    type: 'record_sale',
    summary: summarizeSale(items, customer, onCredit),
    items,
    product_name: items[0]?.product_name ?? null,
    quantity: items[0]?.quantity ?? null,
    unit_price: items[0]?.unit_price ?? null,
    customer_name: customer,
    customer_phone: phone,
    payment_method: payment,
    on_credit: onCredit,
    amount: null,
    category: null,
    note: null,
    date: null,
  };

  return {
    kind: 'action',
    action,
    reply: problems.length
      ? `${problems.join(' ')} I kept the items I recognised — check the card below, edit if needed, then confirm.`
      : "Here's what I understood (offline mode). Check the items, tap Edit to change anything, then confirm — it saves on this device and syncs automatically.",
  };
}

/* ---------------------------------------------------------------- expense */

function parseExpense(original: string, ctx: OfflineParseContext): OfflineParseResult {
  const text = preprocess(original);
  const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (!amountMatch) {
    return { kind: 'reply', reply: 'How much was the expense? Try "Spent 200 on transport".' };
  }
  const amount = Number(amountMatch[1]);
  const lower = text.toLowerCase();
  const category =
    EXPENSE_CATEGORIES.find((entry) => lower.includes(entry.toLowerCase())) ??
    EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

  const note = text
    .slice((amountMatch.index ?? 0) + amountMatch[0].length)
    .replace(/^\s*(on|for)\s+/i, '')
    .trim();

  const action: AssistantAction = {
    type: 'record_expense',
    summary: `Expense — ${category} (${formatCurrency(amount, ctx.currency)})`,
    amount,
    category,
    payment_method: detectPaymentMethod(text),
    note: note || category,
    items: null,
    product_name: null,
    quantity: null,
    unit_price: null,
    customer_name: null,
    customer_phone: null,
    date: null,
    on_credit: null,
  };

  return {
    kind: 'action',
    action,
    reply: "Got it (offline mode). Check the card and confirm — it saves on this device and syncs automatically.",
  };
}

/* ----------------------------------------------------------------- income */

function parseIncome(original: string, ctx: OfflineParseContext): OfflineParseResult {
  const text = preprocess(original);
  const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (!amountMatch) {
    return { kind: 'reply', reply: 'How much did you receive? Try "Received 500 from dad".' };
  }
  const amount = Number(amountMatch[1]);
  const lower = text.toLowerCase();
  const category =
    OTHER_INCOME_CATEGORIES.find((entry) => lower.includes(entry.toLowerCase())) ??
    OTHER_INCOME_CATEGORIES[OTHER_INCOME_CATEGORIES.length - 1];

  const note = text
    .slice((amountMatch.index ?? 0) + amountMatch[0].length)
    .replace(/^\s*(from|for)\s+/i, '')
    .trim();

  const action: AssistantAction = {
    type: 'record_income',
    summary: `Other income — ${category} (${formatCurrency(amount, ctx.currency)})`,
    amount,
    category,
    payment_method: detectPaymentMethod(text),
    note: note || category,
    items: null,
    product_name: null,
    quantity: null,
    unit_price: null,
    customer_name: null,
    customer_phone: null,
    date: null,
    on_credit: null,
  };

  return {
    kind: 'action',
    action,
    reply: "Got it (offline mode). Check the card and confirm — it saves on this device and syncs automatically.",
  };
}

/* -------------------------------------------------------------- customers */

function parseCustomer(original: string): OfflineParseResult {
  let text = original.replace(CUSTOMER_INTENT, ' ').replace(/\s+/g, ' ').trim();
  const [withoutPhone, phone] = extractPhone(text);
  text = withoutPhone.replace(/\b(phone|number|contact)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  const name = titleCase(text);

  if (!name) {
    return { kind: 'reply', reply: 'What is the customer\'s name? Try "Add customer Kofi Mensah 0244123456".' };
  }

  const action: AssistantAction = {
    type: 'add_customer',
    summary: `Add customer — ${name}`,
    customer_name: name,
    customer_phone: phone,
    items: null,
    product_name: null,
    quantity: null,
    unit_price: null,
    amount: null,
    category: null,
    payment_method: null,
    note: null,
    date: null,
    on_credit: null,
  };

  return {
    kind: 'action',
    action,
    reply: "I'll add this customer once you confirm — saved on this device and synced when you're back online.",
  };
}

/* ----------------------------------------------------------------- queries */

function parseQuery(text: string, ctx: OfflineParseContext): OfflineParseResult {
  const lower = text.toLowerCase();

  if (/stock/.test(lower) && /(low|running|out|left|finish|reorder|remain)/.test(lower)) {
    const lows = ctx.products
      .filter((p) => num(p.quantity ?? p.stock) <= num(p.low_stock_threshold ?? p.reorder_level ?? 5))
      .slice(0, 10);
    return {
      kind: 'reply',
      reply: lows.length
        ? `Low on stock (from this device): ${lows
            .map((p) => `${p.name} — ${num(p.quantity ?? p.stock)} left`)
            .join(', ')}.`
        : 'Nothing is low on stock, based on the data saved on this device.',
    };
  }

  if (/today/.test(lower) && /(how\s+much|total|made|make|sales?|sold|sell|revenue|earn)/.test(lower)) {
    const todayKey = new Date().toDateString();
    const todays = (ctx.localSales ?? []).filter((record) => {
      const when = record.snapshot?.sale_date
        ? new Date(String(record.snapshot.sale_date))
        : record.createdAt
          ? new Date(record.createdAt)
          : null;
      return when && !Number.isNaN(when.getTime()) && when.toDateString() === todayKey;
    });
    const total = todays.reduce((sum, record) => sum + num(record.snapshot?.total), 0);
    return {
      kind: 'reply',
      reply: todays.length
        ? `Recorded on this device today: ${todays.length} sale(s) totalling ${formatCurrency(total, ctx.currency)} — waiting to sync. Reconnect for your full figures.`
        : 'No sales are saved on this device for today. Reconnect and I can check your full records.',
    };
  }

  if (/how\s+many\s+products|product\s+count/.test(lower)) {
    return {
      kind: 'reply',
      reply: `You have ${ctx.products.length} product(s) in your catalogue, based on the data saved on this device.`,
    };
  }

  return {
    kind: 'reply',
    reply: `I'm offline, so I can only work with the data saved on this device. ${OFFLINE_CAPABILITIES}`,
  };
}

/* ------------------------------------------------------------------ entry */

export function parseOfflineCommand(raw: string, ctx: OfflineParseContext): OfflineParseResult {
  const text = String(raw || '').trim();
  if (!text) {
    return { kind: 'reply', reply: 'Tell me what happened — e.g. "Sold 2 shirts at 50".' };
  }

  if (CUSTOMER_INTENT.test(text)) return parseCustomer(text);

  if (RESTOCK_INTENT.test(text)) {
    return {
      kind: 'reply',
      reply: 'Restocking needs an internet connection — stock levels have to be checked against the server. Please reconnect and ask again.',
    };
  }

  const looksLikeQuestion = QUESTION_START.test(text) || text.endsWith('?');
  if (!looksLikeQuestion) {
    if (SALE_INTENT.test(text)) return parseSale(text, ctx);
    if (EXPENSE_INTENT.test(text)) return parseExpense(text, ctx);
    if (INCOME_INTENT.test(text)) return parseIncome(text, ctx);
  }

  if (looksLikeQuestion) return parseQuery(text, ctx);

  return {
    kind: 'reply',
    reply: `I'm offline, so I can only work with the data saved on this device. ${OFFLINE_CAPABILITIES}`,
  };
}
