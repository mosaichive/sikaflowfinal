// Sends an SMS to the configured Super Admin number for key platform events.
// Best-effort: never throws. Logs success/failure to sms_logs.
import { sendSms } from './at-sms.ts';
import { adminClient } from './sms-log.ts';

const SUPER_ADMIN_PHONE_FALLBACK = '+233544909011';

export function getSuperAdminPhone(): string {
  return (Deno.env.get('SUPER_ADMIN_SMS_PHONE') || '').trim() || SUPER_ADMIN_PHONE_FALLBACK;
}

type NotifyOpts = {
  message: string;
  kind: 'payment_success' | 'admin_event';
  referenceId?: string | null;
};

export async function notifySuperAdmin({ message, kind, referenceId = null }: NotifyOpts) {
  const to = getSuperAdminPhone();
  try {
    const res = await sendSms({ to, message });
    try {
      await adminClient().from('sms_logs').insert({
        business_id: null,
        recipient_phone: to,
        notification_type: kind === 'payment_success' ? 'super_admin_payment' : 'super_admin_event',
        message_preview: message.slice(0, 160),
        provider_response: res.raw ?? null,
        status: res.delivered ? 'sent' : 'sent',
        error_message: null,
        reference_id: referenceId,
      });
    } catch (logErr) {
      console.error('[super-admin-sms] log insert failed', logErr);
    }
    return { ok: true };
  } catch (err) {
    console.error('[super-admin-sms] send failed', err);
    try {
      await adminClient().from('sms_logs').insert({
        business_id: null,
        recipient_phone: to,
        notification_type: kind === 'payment_success' ? 'super_admin_payment' : 'super_admin_event',
        message_preview: message.slice(0, 160),
        provider_response: null,
        status: 'failed',
        error_message: err instanceof Error ? err.message : String(err),
        reference_id: referenceId,
      });
    } catch (_) { /* ignore */ }
    return { ok: false };
  }
}
