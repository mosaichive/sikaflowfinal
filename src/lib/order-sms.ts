// Fire-and-forget SMS helpers for the Orders module. Never throws.
import { supabase } from '@/integrations/supabase/client';

export async function notifyOrderEvent(orderId: string, event: 'created' | 'status') {
  if (!orderId) return;
  try {
    const { data, error } = await supabase.functions.invoke('send-order-sms', {
      body: { order_id: orderId, event },
    });
    if (error) console.warn('[order-sms] invoke error', error);
    else if (!(data as any)?.ok) console.warn('[order-sms] not sent', data);
  } catch (err) {
    console.warn('[order-sms] threw', err);
  }
}
