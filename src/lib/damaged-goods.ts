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
  product_id?: string | null;
  product_name?: string | null;
  quantity?: number | string | null;
  unit_cost?: number | string | null;
  total_value?: number | string | null;
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
