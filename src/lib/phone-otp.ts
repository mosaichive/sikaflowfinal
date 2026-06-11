/**
 * Phone OTP client helpers — Ghana-aware E.164 normalization plus a single
 * place that turns Supabase `FunctionsHttpError` instances into the actual
 * server error message (otherwise we just get "Edge Function returned a
 * non-2xx status code", which is what makes failed SMS sends look like
 * silent successes to the user).
 */
import { getFunctionErrorMessage } from '@/lib/function-errors';

export function normalizeGhanaPhone(raw: string): string {
  const p = String(raw || '').trim().replace(/[\s\-()]/g, '');
  if (!p) return '';
  if (p.startsWith('+')) return '+' + p.slice(1).replace(/\D/g, '');
  if (/^0\d{9}$/.test(p)) return '+233' + p.slice(1);
  if (/^[2-5]\d{8}$/.test(p)) return '+233' + p;
  if (/^\d{9,15}$/.test(p)) return '+' + p;
  return p;
}

export function isValidE164(phone: string): boolean {
  return /^\+\d{9,15}$/.test(phone);
}

export async function getOtpErrorMessage(
  error: unknown,
  fallback = 'We could not send the verification code. Please check your number or try email sign-up.',
) {
  const raw = await getFunctionErrorMessage(error, fallback);
  // Common Supabase generic message — never useful to show.
  if (/non-2xx status code/i.test(raw)) return fallback;
  return raw || fallback;
}
