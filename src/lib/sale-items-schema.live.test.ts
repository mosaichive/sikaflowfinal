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
  let businessId = '';
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
    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('business_id')
      .eq('user_id', userId)
      .single();
    if (profileError || !profile?.business_id) {
      throw new Error(`Business lookup failed: ${profileError?.message ?? 'no business'}`);
    }
    businessId = profile.business_id;
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
        .eq('business_id', businessId);
      await client
        .from('sales')
        .delete()
        .in('id', createdSaleIds)
        .eq('business_id', businessId);
    }
    await client.auth.signOut();
  });

  it('inserts a business-scoped sale and sale item', async () => {
    const now = new Date().toISOString();

    // 1. Insert a sale row using ONLY columns the schema actually has.
    const { data: sale, error: saleErr } = await client
      .from('sales')
      .insert({
        business_id: businessId,
        sale_date: now,
        customer_name: '[test] vitest live',
        subtotal: 10,
        total: 10,
        amount_paid: 10,
        discount: 0,
        payment_method: 'cash',
      })
      .select()
      .single();

    expect(saleErr).toBeNull();
    expect(sale?.id).toBeTruthy();
    if (sale?.id) createdSaleIds.push(sale.id);

    // Validate the compatibility payload used by SalesPage. It includes both
    // legacy aliases and the current business-scoped columns.
    const rawPayload = {
      user_id: userId,
      business_id: businessId,
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

    // Insert the current production shape after dropping legacy aliases.
    const normalized = normalizeSaleItemPayload(rawPayload);
    delete normalized.user_id;
    delete normalized.unit_cost;
    delete normalized.total;

    const { data: item, error: itemErr } = await client
      .from('sale_items')
      .insert(normalized as never)
      .select()
      .single();

    expect(itemErr, itemErr?.message ?? '').toBeNull();
    expect(item).toBeTruthy();
    expect(item!.business_id).toBe(businessId);
    expect(Number(item!.cost_price)).toBe(6);
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
