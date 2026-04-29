export function trialDaysLeft(endDateIso: string): number {
  const ms = new Date(endDateIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function isTrialActive(endDateIso: string): boolean {
  return new Date(endDateIso).getTime() > Date.now();
}
