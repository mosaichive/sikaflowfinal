import { describe, expect, it } from 'vitest';

import { parseOfflineCommand, type OfflineParseContext } from '@/lib/offline-assistant';

const products = [
  { id: 'p1', name: 'T-Shirt', sku: 'TS-1', selling_price: 90, cost_price: 70, quantity: 85, low_stock_threshold: 3 },
  { id: 'p2', name: 'School Bag', sku: 'SB-1', selling_price: 120, cost_price: 80, quantity: 10, low_stock_threshold: 2 },
  { id: 'p3', name: 'Sandals', sku: 'SD-1', selling_price: 40, cost_price: 20, quantity: 0, low_stock_threshold: 5 },
];

const ctx: OfflineParseContext = { products, customers: [], localSales: [], currency: 'GHS' };

describe('offline assistant parser — multi-item sales', () => {
  it('parses "and" separated items into ONE sale with independent lines', () => {
    const result = parseOfflineCommand('I sold 3 t shirts at 50 each and 2 school bags for 100', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.type).toBe('record_sale');
    expect(result.action.items).toHaveLength(2);
    expect(result.action.items![0]).toMatchObject({ product_name: 'T-Shirt', quantity: 3, unit_price: 50 });
    expect(result.action.items![1]).toMatchObject({ product_name: 'School Bag', quantity: 2, unit_price: 100 });
  });

  it('splits on commas and "plus"', () => {
    const result = parseOfflineCommand('Sold 1 t-shirt, 2 sandals plus 1 school bag', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.items).toHaveLength(3);
    expect(result.action.items!.map((i) => i.product_name)).toEqual(['T-Shirt', 'Sandals', 'School Bag']);
  });

  it('detects credit sales and the customer name', () => {
    const result = parseOfflineCommand('sold 2 t shirts at 90 to Ama on credit', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.on_credit).toBe(true);
    expect(result.action.customer_name).toBe('Ama');
    expect(result.action.items).toHaveLength(1);
  });

  it('leaves unit_price null when no price is spoken (catalogue price applies at save)', () => {
    const result = parseOfflineCommand('sold 2 school bags', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.items![0]).toMatchObject({ product_name: 'School Bag', quantity: 2, unit_price: null });
  });

  it('matches fuzzy speech variations (missing spaces, hyphens)', () => {
    const result = parseOfflineCommand('sold 1 tshirt at 50', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.items![0].product_name).toBe('T-Shirt');
  });

  it('asks instead of saving when a product cannot be found', () => {
    const result = parseOfflineCommand('sold 2 laptops at 100', ctx);
    expect(result.kind).toBe('reply');
    if (result.kind !== 'reply') return;
    expect(result.reply.toLowerCase()).toContain("couldn't find");
  });

  it('captures the customer phone number without corrupting quantities', () => {
    const result = parseOfflineCommand('sold 2 t shirts at 90 to Ama 0244123456', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.customer_phone).toBe('0244123456');
    expect(result.action.items![0]).toMatchObject({ quantity: 2, unit_price: 90 });
  });
});

describe('offline assistant parser — expenses, income, customers', () => {
  it('parses expenses with category detection', () => {
    const result = parseOfflineCommand('spent 200 on transport', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.type).toBe('record_expense');
    expect(result.action.amount).toBe(200);
    expect(result.action.category).toBe('Transport');
  });

  it('parses income', () => {
    const result = parseOfflineCommand('received 500 from dad', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.type).toBe('record_income');
    expect(result.action.amount).toBe(500);
  });

  it('parses add customer with phone', () => {
    const result = parseOfflineCommand('add customer Kofi Mensah 0244123456', ctx);
    expect(result.kind).toBe('action');
    if (result.kind !== 'action') return;
    expect(result.action.type).toBe('add_customer');
    expect(result.action.customer_name).toBe('Kofi Mensah');
    expect(result.action.customer_phone).toBe('0244123456');
  });
});

describe('offline assistant parser — queries and limitations', () => {
  it('answers low stock from cached products', () => {
    const result = parseOfflineCommand('which products are low on stock?', ctx);
    expect(result.kind).toBe('reply');
    if (result.kind !== 'reply') return;
    expect(result.reply).toContain('Sandals');
  });

  it('summarises offline sales made today', () => {
    const result = parseOfflineCommand('how much did I sell today', {
      ...ctx,
      localSales: [{ createdAt: Date.now(), snapshot: { total: 150, sale_date: new Date().toISOString() } }],
    });
    expect(result.kind).toBe('reply');
    if (result.kind !== 'reply') return;
    expect(result.reply).toContain('1 sale');
    expect(result.reply).toContain('150');
  });

  it('politely refuses cloud-only requests', () => {
    const result = parseOfflineCommand('give me the full profit report for the year', ctx);
    expect(result.kind).toBe('reply');
    if (result.kind !== 'reply') return;
    expect(result.reply.toLowerCase()).toContain('reconnect');
  });

  it('refuses restock while offline', () => {
    const result = parseOfflineCommand('restock 10 t shirts', ctx);
    expect(result.kind).toBe('reply');
    if (result.kind !== 'reply') return;
    expect(result.reply.toLowerCase()).toContain('internet connection');
  });
});
