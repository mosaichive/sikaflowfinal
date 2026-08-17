/**
 * Centralized global currency system for KudiTrack.
 *
 * - ISO 4217 codes are the internal source of truth.
 * - The "active" currency is the currency of the business currently loaded in
 *   the app. It is stored in module state so that the legacy
 *   `formatCurrency(amount)` helper keeps working everywhere without every call
 *   site having to pass a currency code.
 */

export type CurrencyDef = {
  code: string;
  name: string;
  symbol: string;
  flag: string | null;
  country: string | null;
  decimals: number;
  active: boolean;
  is_default?: boolean;
  sort_order?: number;
};

export const DEFAULT_CURRENCY_CODE = 'GHS';

/** Offline fallback registry — replaced at runtime by the database list. */
export const FALLBACK_CURRENCIES: CurrencyDef[] = [
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', flag: '🇬🇭', country: 'Ghana', decimals: 2, active: true, sort_order: 1 },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬', country: 'Nigeria', decimals: 2, active: true, sort_order: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸', country: 'United States', decimals: 2, active: true, sort_order: 3 },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧', country: 'United Kingdom', decimals: 2, active: true, sort_order: 4 },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', country: 'European Union', decimals: 2, active: true, sort_order: 5 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦', country: 'South Africa', decimals: 2, active: true, sort_order: 6 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪', country: 'Kenya', decimals: 2, active: true, sort_order: 7 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', flag: '🇨🇦', country: 'Canada', decimals: 2, active: true, sort_order: 8 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺', country: 'Australia', decimals: 2, active: true, sort_order: 9 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵', country: 'Japan', decimals: 0, active: true, sort_order: 10 },
];

let registry: CurrencyDef[] = FALLBACK_CURRENCIES;
let registryMap = new Map(registry.map((c) => [c.code, c]));
let activeCode = DEFAULT_CURRENCY_CODE;

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot = { code: activeCode, version: 0 };

function emit() {
  snapshot = { code: activeCode, version: snapshot.version + 1 };
  listeners.forEach((fn) => fn());
}

export function subscribeToCurrency(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCurrencySnapshot() {
  return snapshot;
}

export function setCurrencyRegistry(list: CurrencyDef[]) {
  if (!list.length) return;
  registry = [...list].sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.code.localeCompare(b.code));
  registryMap = new Map(registry.map((c) => [c.code, c]));
  emit();
}

export function getCurrencyRegistry() {
  return registry;
}

export function getCurrency(code?: string | null): CurrencyDef {
  const normalized = String(code || '').trim().toUpperCase();
  return (
    registryMap.get(normalized) ||
    FALLBACK_CURRENCIES.find((c) => c.code === normalized) ||
    registryMap.get(DEFAULT_CURRENCY_CODE) ||
    FALLBACK_CURRENCIES[0]
  );
}

export function getActiveCurrencyCode() {
  return activeCode;
}

export function getActiveCurrency() {
  return getCurrency(activeCode);
}

export function setActiveCurrencyCode(code: string | null | undefined) {
  const normalized = String(code || '').trim().toUpperCase() || DEFAULT_CURRENCY_CODE;
  if (normalized === activeCode) return;
  activeCode = normalized;
  emit();
}

function needsSpace(symbol: string) {
  // Alphabetic symbols (KSh, CFA, CHF, kr) read better with a space.
  return /[A-Za-z]$/.test(symbol);
}

/**
 * Format a monetary amount using the given currency (defaults to the active
 * business currency). Respects each currency's decimal rules.
 */
export function formatMoney(amount: number | string | null | undefined, code?: string | null) {
  const currency = getCurrency(code ?? activeCode);
  const value = Number(amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  const digits = currency.decimals ?? 2;
  const formatted = Math.abs(safe).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = safe < 0 ? '-' : '';
  return `${sign}${currency.symbol}${needsSpace(currency.symbol) ? ' ' : ''}${formatted}`;
}

/** Formats with the ISO code appended, e.g. "₵1,250.50 GHS". Useful on documents. */
export function formatMoneyWithCode(amount: number | string | null | undefined, code?: string | null) {
  const currency = getCurrency(code ?? activeCode);
  return `${formatMoney(amount, currency.code)} ${currency.code}`;
}

export function currencyLabel(code?: string | null) {
  const c = getCurrency(code);
  return `${c.flag ? `${c.flag} ` : ''}${c.name} (${c.code}) ${c.symbol}`.trim();
}

export function searchCurrencies(list: CurrencyDef[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((c) =>
    [c.code, c.name, c.symbol, c.country ?? ''].some((field) => field.toLowerCase().includes(q)),
  );
}
