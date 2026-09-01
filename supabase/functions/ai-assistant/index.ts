import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { runAssistantTurn } from '../_shared/ai-provider.ts';


const ACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'action'],
  properties: {
    reply: {
      type: 'string',
      description: 'Short, friendly reply to show the business owner. Never invent numbers.',
    },
    action: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: [
        'type', 'summary', 'items', 'product_name', 'quantity', 'unit_price',
        'customer_name', 'customer_phone', 'amount', 'category',
        'payment_method', 'note', 'date', 'on_credit',
      ],
      properties: {
        type: {
          type: 'string',
          enum: ['record_sale', 'record_expense', 'record_income', 'add_customer', 'restock', 'add_product'],
        },
        summary: { type: 'string', description: 'One-line human summary of what will be saved.' },
        items: {
          type: ['array', 'null'],
          description:
            'For record_sale only: one entry per product mentioned, in the order spoken. Null for every other action type.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['product_name', 'quantity', 'unit_price'],
            properties: {
              product_name: { type: 'string', description: 'Best catalogue match for this line.' },
              quantity: { type: ['number', 'null'], description: 'Defaults to 1 when not stated.' },
              unit_price: { type: ['number', 'null'], description: 'Null = apply the catalogue price.' },
            },
          },
        },
        product_name: { type: ['string', 'null'], description: 'First sale item, or the product for restock/add_product.' },
        quantity: { type: ['number', 'null'] },
        unit_price: { type: ['number', 'null'] },
        customer_name: { type: ['string', 'null'] },
        customer_phone: { type: ['string', 'null'] },
        amount: { type: ['number', 'null'] },
        category: { type: ['string', 'null'] },
        payment_method: { type: ['string', 'null'], description: 'cash | momo | card | bank_transfer' },
        note: { type: ['string', 'null'] },
        date: { type: ['string', 'null'], description: 'ISO date (YYYY-MM-DD) if the user named a day.' },
        on_credit: {
          type: ['boolean', 'null'],
          description:
            'record_sale only: true when the customer has not paid yet ("on credit", "will pay later", "owes me"); false when paid.',
        },
      },
    },
  },
} as const;

function systemPrompt(ctx: any) {
  const products = Array.isArray(ctx?.products) ? ctx.products : [];
  const productLines = products
    .slice(0, 200)
    .map((p: any) => `- ${p.name}${p.sku ? ` (${p.sku})` : ''}: price ${p.price}, cost ${p.cost}, stock ${p.stock}`)
    .join('\n');

  return `You are the KudiTrack AI Business Assistant for a small business in ${ctx?.country || 'Ghana'}.
You help the owner record transactions and answer questions about their own business data, in plain conversational language.
Today is ${ctx?.today}. The business currency is ${ctx?.currency}. Business name: ${ctx?.businessName || 'this business'}.

RULES
- Only ever discuss this business's data given below. Never invent numbers, products or customers.
- If the user asks a question (sales, profit, stock, customers, expenses), answer from the snapshot and set "action" to null.
- If the user wants to RECORD something, return the matching action with every field you can infer, and a clear "summary".
  The app will show a confirmation card; never claim something is saved.
- MULTI-ITEM SALES: "sold 3 shirts at 50 each and 2 bags for 100, plus 1 sandal" is ONE record_sale with one "items" entry
  per product, in the order spoken. Split on "and", "plus", "also", "then", commas and semicolons. Always fill "items" for
  record_sale (even for a single item), and mirror the first item into product_name/quantity/unit_price.
- Prices: "at X", "for X", "X each" or "@X" set that item's unit_price. If no price is stated for an item, set its
  unit_price to null — the app applies the catalogue price. Never compute or invent totals.
- CREDIT: "on credit", "hasn't paid", "not paid", "will pay later" or "owes me" set on_credit to true; a paid sale is
  false; other action types use null.
- If key details are missing or ambiguous (product not in the catalogue, no amount, unclear quantity), set action to null and ask ONE short clarifying question.
- Match product names to the catalogue below (case-insensitive, tolerate typos, plurals and missing spaces like "tshirt").
- Amounts are plain numbers, no currency symbols. payment_method must be one of: cash, momo, card, bank_transfer (default cash).
- Expense category should be one of: ${(ctx?.expenseCategories || []).join(', ')}.
- Income category should be one of: ${(ctx?.incomeCategories || []).join(', ')}.
- The user may only use these modules: ${(ctx?.modules || []).join(', ')}. Politely refuse actions outside them.
- Keep replies under 60 words. Be warm, direct and practical, like a helpful shop manager.

PRODUCT CATALOGUE
${productLines || '(no products yet)'}

BUSINESS SNAPSHOT
${JSON.stringify(ctx?.snapshot ?? {}, null, 1)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => null);
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages || messages.length === 0) return json({ error: 'messages is required' }, 400);

    const trimmed = messages
      .filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
      .slice(-12)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

    const result = await runAssistantTurn({
      systemPrompt: systemPrompt(body?.context ?? {}),
      messages: trimmed,
      schema: ACTION_SCHEMA,
    });

    if (!result.ok) return json({ error: result.error }, result.status);

    return json({ reply: result.reply, action: result.action ?? null }, 200);
  } catch (error) {
    console.error('[ai-assistant] unexpected', error);
    return json({ error: 'Unexpected assistant error.' }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Accumulates `response.output_text` deltas from the SSE stream. */
async function readOutputText(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          text += event.delta;
        } else if (event.type === 'response.completed' && !text) {
          const output = event.response?.output ?? [];
          for (const item of output) {
            for (const part of item?.content ?? []) {
              if (part?.type === 'output_text' && typeof part.text === 'string') text += part.text;
            }
          }
        }
      } catch {
        // Ignore malformed SSE frames.
      }
    }
  }
  return text;
}
