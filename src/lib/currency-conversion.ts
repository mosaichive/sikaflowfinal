import { supabase } from '@/integrations/supabase/client';

/**
 * Optional historical conversion when a business switches currency.
 *
 * Only monetary columns are touched, and only rows owned by the signed-in
 * business. Quantities, dates, names, references and every non-money field are
 * left exactly as they are. Nothing is ever deleted.
 */
type MoneyTable = { table: string; ownerColumn: string; columns: string[] };

const MONEY_TABLES: MoneyTable[] = [
  { table: 'products', ownerColumn: 'user_id', columns: ['price', 'cost'] },
  { table: 'sales', ownerColumn: 'user_id', columns: ['total', 'cost_total', 'subtotal', 'discount', 'amount_paid', 'balance'] },
  { table: 'sale_items', ownerColumn: 'user_id', columns: ['unit_price', 'unit_cost', 'cost_price', 'line_total'] },
  { table: 'expenses', ownerColumn: 'user_id', columns: ['amount'] },
  { table: 'other_income', ownerColumn: 'user_id', columns: ['amount'] },
  { table: 'savings', ownerColumn: 'user_id', columns: ['amount'] },
  { table: 'investments', ownerColumn: 'user_id', columns: ['amount'] },
  { table: 'investor_funding', ownerColumn: 'user_id', columns: ['amount'] },
  { table: 'restocks', ownerColumn: 'user_id', columns: ['cost_price_per_unit', 'total_cost'] },
  { table: 'orders', ownerColumn: 'business_id', columns: ['subtotal', 'discount', 'total', 'amount_paid', 'balance', 'delivery_fee'] },
  { table: 'order_items', ownerColumn: 'business_id', columns: ['unit_price', 'cost_price', 'line_total'] },
];

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export type ConversionSummary = { table: string; rows: number; error?: string };

export async function convertBusinessRecords(
  ownerId: string,
  rate: number,
  decimals = 2,
): Promise<ConversionSummary[]> {
  const db = supabase as any;
  const summaries: ConversionSummary[] = [];

  for (const spec of MONEY_TABLES) {
    try {
      const { data, error } = await db
        .from(spec.table)
        .select(['id', ...spec.columns].join(', '))
        .eq(spec.ownerColumn, ownerId);
      if (error) throw error;

      let updated = 0;
      for (const row of data ?? []) {
        const patch: Record<string, number> = {};
        spec.columns.forEach((col) => {
          const current = Number((row as any)[col] ?? 0);
          if (Number.isFinite(current)) patch[col] = round(current * rate, decimals);
        });
        const { error: updateError } = await db.from(spec.table).update(patch).eq('id', (row as any).id);
        if (updateError) throw updateError;
        updated += 1;
      }
      summaries.push({ table: spec.table, rows: updated });
    } catch (error: any) {
      // Locked rows (e.g. completed orders) are skipped rather than failing the run.
      summaries.push({ table: spec.table, rows: 0, error: error?.message ?? 'update_failed' });
    }
  }

  return summaries;
}
