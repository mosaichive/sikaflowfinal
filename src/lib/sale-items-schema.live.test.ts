import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  validateSaleItemPayload,
  normalizeSaleItemPayload,
} from '@/lib/sale-items-schema';

// ---------------------------------------------------------------------------
// Live Supabase integration test for the sale + sale_items flow.
//
// SKIP RULES: The test only runs when all four env vars are present:
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_PUBLISHABLE_KEY
//   TEST_USER_EMAIL
//   TEST_USER_PASSWORD
//
// In CI / dev sandboxes without those, the suite reports a single skipped
// test instead of failing. Run locally with:
//
//   TEST_USER_EMAIL=... TEST_USER_PASSWORD=... bun test src/lib/sale-items-schema.live.test.ts
//
// The test cleans up every row it creates in `afterAll`.
// ---------------------------------------------------------------------------

const url =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL;
const anonKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

const credsAvailable = Boolean(url && anonKey && email && password);
const describeMaybe = credsAvailable ? describe : describe.skip;

describeMaybe('sale_items live integration', () => {
  let client: SupabaseClient;
  let userId = '';
  const createdSaleIds: string[] = [];

  beforeAll(async () => {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: email!,
      password: password!,
    });
    if (error || !data.user) {
      throw new Error(`Sign-in failed: ${error?.message ?? 'no user'}`);
    }
    userId = data.user.id;
  }, 30_000);

  afterAll(async () => {
    if (createdSaleIds.length > 0) {
      // Deleting the sale cascades through sale_items via the
      // adjust_stock_on_sale_item DELETE branch. We don't have a
      // foreign-key cascade, so delete sale_items first.
      await client
        .from('sale_items')
        .delete()
        .in('sale_id', createdSaleIds)
        .eq('user_id', userId);
      await client
        .from('sales')
        .delete()
        .in('id', createdSaleIds)
        .eq('user_id', userId);
    }
    await client.auth.signOut();
  });

  it('inserts a sale + sale_item without business_id and validates payload', async () => {
    const now = new Date().toISOString();

    // 1. Insert a sale row using ONLY columns the schema actually has.
    const { data: sale, error: saleErr } = await client
      .from('sales')
      .insert({
        user_id: userId,
        sale_date: now,
        customer_name: '[test] vitest live',
        total: 10,
        cost_total: 6,
        amount_paid: 10,
        discount: 0,
        payment_method: 'cash',
      })
      .select()
      .single();

    expect(saleErr).toBeNull();
    expect(sale?.id).toBeTruthy();
    if (sale?.id) createdSaleIds.push(sale.id);

    // 2. Validate the sale_item payload up front. We send a multi-tenant
    // shape (with business_id, cost_price, line_total) to prove the
    // normalizer + validator handle it.
    const rawPayload = {
      user_id: userId,
      business_id: 'should-be-dropped-by-schema-tolerant-insert',
      sale_id: sale!.id,
      product_name: '[test] vitest item',
      quantity: 1,
      unit_price: 10,
      cost_price: 6, // remapped to unit_cost by normalizer
      line_total: 10,
    };
    const validation = validateSaleItemPayload(rawPayload);
    if (validation.ok === false) {
      throw new Error(`validation failed: ${validation.message}`);
    }
    expect(validation.ok).toBe(true);

    // 3. Insert the sale_item directly (mirrors what insertSaleItemRecord
    // does, minus the optional-column fallback). business_id will fail
    // the insert if we don't drop it.
    const normalized = normalizeSaleItemPayload(rawPayload);
    delete normalized.business_id; // single-tenant schema doesn't have it
    delete normalized.cost_price;
    delete normalized.line_total;

    const { data: item, error: itemErr } = await client
      .from('sale_items')
      .insert(normalized as never)
      .select()
      .single();

    expect(itemErr, itemErr?.message ?? '').toBeNull();
    expect(item).toBeTruthy();
    expect(Number(item!.unit_cost)).toBe(6);
    expect(Number(item!.unit_price)).toBe(10);
    expect(Number(item!.quantity)).toBe(1);
  }, 30_000);

  it('rejects a payload missing required fields', () => {
    const result = validateSaleItemPayload({
      user_id: userId,
      // sale_id missing
      product_name: '',
      quantity: 0,
      unit_price: -1,
      unit_cost: 'oops',
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.message).toMatch(/sale_id|product_name|quantity|unit_price|unit_cost/);
    }
  });
});

if (!credsAvailable) {
  describe('sale_items live integration', () => {
    it.skip('skipped: set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD to run', () => {});
  });
}
