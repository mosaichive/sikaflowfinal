/**
 * Shared fuzzy product matching for the AI Business Assistant (online + offline).
 * No runtime imports, so it stays unit-testable and safe for the offline parser.
 */

export interface ProductLike {
  id?: string;
  name?: string | null;
  sku?: string | null;
  [key: string]: unknown;
}

export function normalizeProductText(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function squash(value: string): string {
  return normalizeProductText(value).replace(/\s+/g, '');
}

function stem(token: string): string {
  return token.length > 3 ? token.replace(/s$/, '') : token;
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeProductText(value).split(' ').filter(Boolean).map(stem));
}

export interface ProductMatch<T = any> {
  product: T;
  score: number;
}

/** Minimum score for a match to be considered usable. */
export const MATCH_THRESHOLD = 40;

/**
 * Scores every product against a free-text name; higher is better.
 * Tolerates case, plurals, hyphens/punctuation and missing spaces ("tshirt").
 */
export function matchProductCandidates<T extends ProductLike>(
  products: T[],
  name?: string | null,
): ProductMatch<T>[] {
  const query = normalizeProductText(name);
  if (!query) return [];
  const queryTokens = tokenSet(query);
  const querySquashed = squash(query);

  const scored: ProductMatch<T>[] = [];
  for (const product of products || []) {
    const productName = normalizeProductText(product?.name);
    if (!productName) continue;
    const productSquashed = squash(productName);
    let score = 0;

    if (productName === query) {
      score = 100;
    } else if (normalizeProductText(product?.sku) === query) {
      score = 95;
    } else if (productSquashed === querySquashed) {
      score = 90;
    } else if (productName.includes(query) || query.includes(productName)) {
      score = 70 + (Math.min(query.length, productName.length) / Math.max(query.length, productName.length)) * 10;
    } else if (productSquashed.includes(querySquashed) || querySquashed.includes(productSquashed)) {
      score = 60;
    } else {
      const productTokens = tokenSet(productName);
      let overlap = 0;
      for (const token of queryTokens) if (productTokens.has(token)) overlap++;
      if (overlap > 0) {
        const union = new Set([...queryTokens, ...productTokens]).size;
        score = 20 + (overlap / union) * 45;
      }
    }

    if (score > 0) scored.push({ product, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

/** Best single match, or null when nothing is close enough. */
export function matchProduct<T extends ProductLike>(products: T[], name?: string | null): T | null {
  const [best] = matchProductCandidates(products, name);
  return best && best.score >= MATCH_THRESHOLD ? best.product : null;
}

/** True when the top matches are too close to pick one confidently. */
export function isAmbiguousMatch<T>(matches: ProductMatch<T>[]): boolean {
  if (matches.length < 2) return false;
  return matches[0].score - matches[1].score < 8 && matches[1].score >= MATCH_THRESHOLD;
}
