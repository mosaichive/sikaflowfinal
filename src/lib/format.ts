export function formatCurrency(value: number, currency = "GHS"): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${currency} ${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString();
}
