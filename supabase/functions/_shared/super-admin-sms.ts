// Sends an SMS to the configured Super Admin number for key platform events.
// Best-effort: never throws. Logs success/failure to console only (sms_logs
// is constrained to business-scoped notification types, so we do not write
// platform alerts there).
import { sendSms } from './at-sms.ts';

export function getSuperAdminPhone(): string {
  return (Deno.env.get('SUPER_ADMIN_SMS_PHONE') || '').trim();
}

function redactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 4 ? `***${digits.slice(-4)}` : 'redacted';
}

export async function notifySuperAdmin(message: string, context: Record<string, unknown> = {}) {
  const to = getSuperAdminPhone();
  if (!to) {
    console.warn('[super-admin-sms] no super admin phone configured');
    return { ok: false };
  }
  try {
    const res = await sendSms({ to, message });
    console.log('[super-admin-sms] sent', { to: redactPhone(to), delivered: res.delivered, ...context });
    return { ok: true };
  } catch (err) {
    console.error('[super-admin-sms] failed', {
      to: redactPhone(to),
      error: err instanceof Error ? err.message : String(err),
      ...context,
    });
    return { ok: false };
  }
}
