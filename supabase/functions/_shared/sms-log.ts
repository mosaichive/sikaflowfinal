// Shared helper to persist SMS send attempts into public.sms_logs using the
// service-role client. Never throws — logging is best-effort.
import { createClient } from 'jsr:@supabase/supabase-js@2';

type LogInput = {
  business_id: string;
  recipient_phone: string;
  notification_type:
    | 'sale_thanks'
    | 'low_stock'
    | 'team_invite'
    | 'new_order'
    | 'order_confirmation'
    | 'order_status';
  message: string;
  status: 'sent' | 'failed';
  provider_response?: unknown;
  error_message?: string | null;
  reference_id?: string | null;
};

function admin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function logSms(input: LogInput) {
  try {
    await admin().from('sms_logs').insert({
      business_id: input.business_id,
      recipient_phone: input.recipient_phone,
      notification_type: input.notification_type,
      message_preview: (input.message || '').slice(0, 160),
      provider_response: input.provider_response ?? null,
      status: input.status,
      error_message: input.error_message ?? null,
      reference_id: input.reference_id ?? null,
    });
  } catch (err) {
    console.error('[sms-log] failed to write log row', err);
  }
}

export function adminClient() {
  return admin();
}
