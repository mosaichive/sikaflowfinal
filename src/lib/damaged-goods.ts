import { toNumber } from '@/lib/sales-inventory';

export const DAMAGE_REASONS = [
  'Broken',
  'Expired',
  'Spoiled',
  'Torn',
  'Missing parts',
  'Defective',
  'Customer return damaged',
  'Other',
] as const;

export type DamageReason = (typeof DAMAGE_REASONS)[number];

export type DamagedGoodsLike = {
  id?: string | null;
  business_id?: string | null;
  user_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  quantity_after?: number | string | null;
  reason?: string | null;
  damage_date?: string | null;
  notes?: string | null;
  unit_cost?: number | string | null;
  total_value?: number | string | null;
  recorded_by?: string | null;
  recorded_by_name?: string | null;
  created_at?: string | null;
};

type ProductLookupLike = {
  id?: string | null;
  business_id?: string | null;
  name?: string | null;
  category?: string | null;
  quantity?: number | string | null;
  cost_price?: number | string | null;
};

type StockMovementLike = {
  id?: string | null;
  business_id?: string | null;
  user_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  movement_type?: string | null;
  quantity_change?: number | string | null;
  quantity_after?: number | string | null;
  unit_cost?: number | string | null;
  reason?: string | null;
  change?: number | string | null;
  note?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  added_by_name?: string | null;
  movement_date?: string | null;
  created_at?: string | null;
};

export type DamagedProductSummary = {
  productId: string;
  productName: string;
  quantity: number;
  value: number;
};

export function getDamagedGoodsValue(entry: DamagedGoodsLike) {
  const storedValue = toNumber(entry.total_value ?? 0);
  if (storedValue > 0) return storedValue;
  return toNumber(entry.quantity ?? 0) * toNumber(entry.unit_cost ?? 0);
}

export function calculateDamagedGoodsSummary(entries: DamagedGoodsLike[]) {
  return entries.reduce(
    (summary, entry) => ({
      quantity: summary.quantity + toNumber(entry.quantity ?? 0),
      value: summary.value + getDamagedGoodsValue(entry),
    }),
    { quantity: 0, value: 0 },
  );
}

export function groupDamagedGoodsByProduct(entries: DamagedGoodsLike[]): DamagedProductSummary[] {
  const grouped = new Map<string, DamagedProductSummary>();

  for (const entry of entries) {
    const productId = entry.product_id || entry.product_name || 'unknown';
    const existing = grouped.get(productId) || {
      productId,
      productName: entry.product_name || 'Unknown product',
      quantity: 0,
      value: 0,
    };
    existing.quantity += toNumber(entry.quantity ?? 0);
    existing.value += getDamagedGoodsValue(entry);
    grouped.set(productId, existing);
  }

  return Array.from(grouped.values()).sort((left, right) => right.value - left.value);
}

function normalizeDamageReason(value: string | null | undefined): DamageReason | string {
  const trimmed = String(value ?? '').trim();
  return DAMAGE_REASONS.includes(trimmed as DamageReason) ? trimmed : 'Other';
}

function parseDamagedMovementNote(note: string | null | undefined) {
  const raw = String(note ?? '').trim();
  const match = raw.match(/^Damaged goods:\s*([^-]+?)(?:\s+-\s+(.+))?$/i);

  return {
    reason: normalizeDamageReason(match?.[1]),
    notes: match?.[2]?.trim() || null,
  };
}

export function isDamagedGoodsMovement(row: StockMovementLike) {
  const type = String(row.movement_type ?? row.reason ?? '').trim().toLowerCase();
  const note = String(row.note ?? '').trim().toLowerCase();
  return type === 'damaged_stock' || type === 'damaged' || note.startsWith('damaged goods:');
}

export function buildDamagedGoodsRowsFromStockMovements(
  movements: StockMovementLike[],
  products: ProductLookupLike[] = [],
): DamagedGoodsLike[] {
  const productsById = new Map(
    products
      .filter((product) => product.id)
      .map((product) => [String(product.id), product]),
  );

  return movements
    .filter(isDamagedGoodsMovement)
    .map((movement) => {
      const product = movement.product_id ? productsById.get(String(movement.product_id)) : undefined;
      const quantity = Math.abs(toNumber(movement.quantity_change ?? movement.change ?? 0));
      const unitCost = toNumber(movement.unit_cost ?? product?.cost_price ?? 0);
      const parsedNote = parseDamagedMovementNote(movement.note);
      const date = movement.movement_date || movement.created_at || new Date().toISOString();

      return {
        id: movement.id ? `stock-movement-${movement.id}` : `stock-movement-${movement.product_id ?? 'unknown'}-${date}`,
        business_id: movement.business_id ?? product?.business_id ?? '',
        user_id: movement.user_id ?? '',
        product_id: movement.product_id ?? '',
        product_name: movement.product_name ?? product?.name ?? 'Unknown product',
        category: product?.category ?? '',
        quantity,
        quantity_after: toNumber(movement.quantity_after ?? product?.quantity ?? 0),
        reason: parsedNote.reason,
        damage_date: date,
        notes: parsedNote.notes,
        unit_cost: unitCost,
        total_value: quantity * unitCost,
        recorded_by: movement.created_by ?? null,
        recorded_by_name: movement.created_by_name ?? movement.added_by_name ?? null,
        created_at: movement.created_at ?? date,
      };
    });
}

export function isMissingDamagedGoodsSchemaError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof maybeError.code === 'string' ? maybeError.code : '';
  const haystack = [maybeError.message, maybeError.details, maybeError.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return (
    code === '42P01'
    || code === 'PGRST205'
    || code === 'PGRST202'
    || haystack.includes('damaged_goods')
    || haystack.includes('record_damaged_goods')
  );
}
