/**
 * Client-side helpers for firing SMS notification edge functions.
 *
 * All helpers are fire-and-forget: they never throw, and they translate
 * non-actionable failures (cooldown hit, preference off, no phone on file)
 * into silent no-ops. Only true delivery failures surface a soft toast.
 */
import { supabase } from '@/integrations/supabase/client';
import { normalizeGhanaPhone, isValidE164 } from '@/lib/phone-otp';

type ToastFn = (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;

type SmsResult = { ok: boolean; reason?: string; error?: string };

async function invoke(fn: string, body: Record<string, unknown>): Promise<SmsResult> {
  try {
    const { data, error } = await supabase.functions.invoke(fn, { body });
    if (error) {
      console.error(`[sms] ${fn} invoke error`, error);
      return { ok: false, reason: 'invoke_error', error: error.message };
    }
    const result = (data ?? {}) as SmsResult;
    if (!result.ok) {
      console.error(`[sms] ${fn} returned failure`, result);
    }
    return { ok: Boolean(result.ok), reason: result.reason, error: result.error };
  } catch (err) {
    console.error(`[sms] ${fn} threw`, err);
    return { ok: false, reason: 'network_error', error: err instanceof Error ? err.message : String(err) };
  }
}

// Reasons that should not surface any UI message at all.
const SILENT_REASONS = new Set([
  'disabled',
  'no_valid_phone',
  'no_recipients',
  'cooldown',
  'above_threshold',
  'no_threshold',
  'invalid_phone',
]);

export async function notifySaleThanks(saleId: string, toast?: ToastFn) {
  if (!saleId) return;
  const res = await invoke('send-sale-thanks-sms', { sale_id: saleId });
  if (!res.ok && toast && !SILENT_REASONS.has(res.reason ?? '')) {
    toast({
      title: 'Sale saved, but SMS could not be sent.',
      description: res.error || res.reason || undefined,
      variant: 'destructive',
    });
  }
}

export async function notifyLowStock(productIds: string[]) {
  const unique = Array.from(new Set((productIds ?? []).filter(Boolean)));
  for (const id of unique) {
    // sequential to avoid hammering AT; failure is silent
    await invoke('send-low-stock-alert', { product_id: id });
  }
}

export function isPhoneSendable(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return isValidE164(normalizeGhanaPhone(phone));
}

export async function notifyTeamInvite(
  inviteId: string,
  phone: string,
  inviteUrl: string,
  toast?: ToastFn,
) {
  if (!inviteId || !phone || !inviteUrl) return;
  const normalized = normalizeGhanaPhone(phone);
  if (!isValidE164(normalized)) {
    toast?.({
      title: 'Invitation created, but SMS could not be sent.',
      description: 'The phone number does not look valid.',
      variant: 'destructive',
    });
    return;
  }
  const res = await invoke('send-team-invite-sms', {
    invite_id: inviteId,
    phone: normalized,
    invite_url: inviteUrl,
  });
  if (!res.ok && toast && !SILENT_REASONS.has(res.reason ?? '')) {
    toast({
      title: 'Invitation created, but SMS could not be sent.',
      description: res.error || res.reason || undefined,
      variant: 'destructive',
    });
  }
}
