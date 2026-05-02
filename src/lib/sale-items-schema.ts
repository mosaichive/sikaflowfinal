import { z } from 'zod';

import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Sale-item payload validation
// ---------------------------------------------------------------------------
//
// The single-tenant `sale_items` table requires:
//   user_id, sale_id, product_name (text), quantity (>0), unit_price (>=0),
//   unit_cost (>=0). product_id is optional but strongly preferred.
//
// We validate the *normalized* payload (i.e. after `cost_price` has been
// remapped to `unit_cost` and `line_total` to `total`). Use
// `normalizeSaleItemPayload` to perform the remap before validation.

export const saleItemInsertSchema = z
  .object({
    user_id: z.string().uuid({ message: 'user_id must be a valid UUID' }),
    sale_id: z.string().uuid({ message: 'sale_id must be a valid UUID' }),
    product_id: z
      .string()
      .uuid({ message: 'product_id must be a valid UUID' })
      .optional()
      .nullable(),
    product_name: z
      .string()
      .trim()
      .min(1, { message: 'product_name is required' })
      .max(200, { message: 'product_name must be 200 characters or fewer' }),
    quantity: z
      .number({ invalid_type_error: 'quantity must be a number' })
      .positive({ message: 'quantity must be greater than 0' })
      .finite(),
    unit_price: z
      .number({ invalid_type_error: 'unit_price must be a number' })
      .nonnegative({ message: 'unit_price cannot be negative' })
      .finite(),
    unit_cost: z
      .number({ invalid_type_error: 'unit_cost must be a number' })
      .nonnegative({ message: 'unit_cost cannot be negative' })
      .finite(),
  })
  // Allow extra fields (sku, size, color, business_id, etc.) — they're
  // dropped by the schema-tolerant insert helper if the column doesn't exist.
  .passthrough();

export type SaleItemInsert = z.infer<typeof saleItemInsertSchema>;

/**
 * Normalize multi-tenant column names to the single-tenant schema before
 * validation. Mirrors the same remapping done by `insertSaleItemRecord`.
 */
export function normalizeSaleItemPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  if (next.cost_price !== undefined && next.unit_cost === undefined) {
    next.unit_cost = next.cost_price;
  }
  if (next.line_total !== undefined && next.total === undefined) {
    next.total = next.line_total;
  }
  // Coerce numeric strings — the form sometimes sends "1" instead of 1.
  for (const key of ['quantity', 'unit_price', 'unit_cost', 'total']) {
    const value = next[key];
    if (typeof value === 'string' && value !== '') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) next[key] = parsed;
    }
  }
  return next;
}

export type SaleItemValidationResult =
  | { ok: true; data: SaleItemInsert }
  | { ok: false; message: string; issues: z.ZodIssue[] };

/**
 * Validate a sale-item payload before insertion. Returns a discriminated
 * union so callers can show a clear toast without try/catch noise.
 */
export function validateSaleItemPayload(
  payload: Record<string, unknown>,
): SaleItemValidationResult {
  const normalized = normalizeSaleItemPayload(payload);
  const result = saleItemInsertSchema.safeParse(normalized);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const message = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`)
    .join('; ');
  return { ok: false, message, issues: result.error.issues };
}

// ---------------------------------------------------------------------------
// Startup schema check
// ---------------------------------------------------------------------------
//
// The columns the app *expects* to exist on the live `sale_items` table.
// Keep this in sync with what `insertSaleItemRecord` will try to insert.
// Optional columns are allowed to be missing — only missing required columns
// trigger a console.error.

const REQUIRED_SALE_ITEMS_COLUMNS = new Set<string>([
  'id',
  'user_id',
  'sale_id',
  'product_name',
  'quantity',
  'unit_price',
  'unit_cost',
]);

const KNOWN_OPTIONAL_SALE_ITEMS_COLUMNS = new Set<string>([
  'product_id',
  'business_id',
  'sku',
  'size',
  'color',
  'cost_price',
  'line_total',
  'total',
  'default_price',
  'price_note',
  'created_at',
  'updated_at',
]);

let saleItemsSchemaCheckRan = false;

export interface SchemaCheckReport {
  table: 'sale_items';
  liveColumns: string[];
  missingRequired: string[];
  unexpectedColumns: string[];
}

/**
 * Fetch the live column list for a table via the `get_table_columns` RPC.
 * Returns null if the RPC is unavailable (e.g. schema cache cold) so the
 * caller can degrade silently rather than throw.
 */
async function fetchTableColumns(table: string): Promise<string[] | null> {
  const { data, error } = await supabase.rpc('get_table_columns' as never, {
    _table_name: table,
  } as never);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[schema-check] could not introspect ${table}:`, error.message);
    return null;
  }
  if (!Array.isArray(data)) return null;
  return (data as Array<{ column_name?: unknown }>)
    .map((row) => (typeof row?.column_name === 'string' ? row.column_name : null))
    .filter((value): value is string => value !== null);
}

/**
 * One-shot startup check: verifies that every column the code expects on
 * `sale_items` actually exists in the database, and that no unexpected
 * extras have appeared. Logs a single grouped console message.
 *
 * No-op after the first call per page load.
 */
export async function runSaleItemsSchemaCheck(options?: {
  force?: boolean;
}): Promise<SchemaCheckReport | null> {
  if (saleItemsSchemaCheckRan && !options?.force) return null;
  saleItemsSchemaCheckRan = true;

  const columns = await fetchTableColumns('sale_items');
  if (!columns) return null;

  const liveSet = new Set(columns);
  const missingRequired: string[] = [];
  for (const col of REQUIRED_SALE_ITEMS_COLUMNS) {
    if (!liveSet.has(col)) missingRequired.push(col);
  }

  const expected = new Set([
    ...REQUIRED_SALE_ITEMS_COLUMNS,
    ...KNOWN_OPTIONAL_SALE_ITEMS_COLUMNS,
  ]);
  const unexpectedColumns = columns.filter((col) => !expected.has(col));

  const report: SchemaCheckReport = {
    table: 'sale_items',
    liveColumns: columns,
    missingRequired,
    unexpectedColumns,
  };

  if (missingRequired.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      '[schema-check] sale_items is missing required columns:',
      missingRequired,
      '\nLive columns:',
      columns,
    );
  } else if (unexpectedColumns.length > 0) {
    // eslint-disable-next-line no-console
    console.info(
      '[schema-check] sale_items has unexpected columns (not used by the app):',
      unexpectedColumns,
    );
  } else {
    // eslint-disable-next-line no-console
    console.debug('[schema-check] sale_items schema OK', { columns });
  }

  return report;
}

// ---------------------------------------------------------------------------
// Stock recompute (admin)
// ---------------------------------------------------------------------------

export interface RecomputeStockResult {
  ok: boolean;
  updated: Array<{ product_id: string; new_stock: number }>;
  error?: string;
}

/**
 * Calls the `recompute_product_stock()` RPC, which rebuilds products.stock
 * from the SUM of stock_movements.change for every product owned by the
 * calling user. Use this from an admin-only "Recalculate stock" button.
 */
export async function recomputeProductStock(): Promise<RecomputeStockResult> {
  const { data, error } = await supabase.rpc('recompute_product_stock' as never);
  if (error) {
    return { ok: false, updated: [], error: error.message };
  }
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  return {
    ok: true,
    updated: rows.map((row) => ({
      product_id: String(row.product_id ?? ''),
      new_stock: Number(row.new_stock ?? 0),
    })),
  };
}
