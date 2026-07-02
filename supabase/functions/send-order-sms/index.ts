// Authenticated endpoint: sends an SMS to the customer about an order event.
// Called from the OrdersPage after: (a) a manual order is created, and
// (b) an order status changes. Fire-and-forget from the UI.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizePhone, sendAtSms } from '../_shared/at-sms.ts';
import { adminClient, logSms } from '../_shared/sms-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const PUBLIC_BASE_URL = (Deno.env.get('APP_PUBLIC_URL') || 'https://kuditrack.online').replace(/\/+$/, '');

function statusMessage(
  status: string,
  ctx: { businessName: string; trackingUrl: string; carrierName?: string | null; carrierPhone?: string | null; trackingCode: string; customerName: string }
): string | null {
  const s = String(status || '').toLowerCase();
  const hi = `Hi ${ctx.customerName},`;
  switch (s) {
    case 'pending':
      return `${hi} your order #${ctx.trackingCode} at ${ctx.businessName} has been received. Track: ${ctx.trackingUrl}`;
    case 'confirmed':
      return `${hi} your order #${ctx.trackingCode} has been confirmed and is being prepared. Track: ${ctx.trackingUrl}`;
    case 'processing':
      return `${hi} your order #${ctx.trackingCode} is currently being processed. Track: ${ctx.trackingUrl}`;
    case 'ready_for_pickup':
      return `${hi} your order #${ctx.trackingCode} is ready for pickup at ${ctx.businessName}. Track: ${ctx.trackingUrl}`;
    case 'out_for_delivery': {
      const carrier = ctx.carrierName?.trim() ? `Carrier: ${ctx.carrierName}. ` : '';
      const carrierPhone = ctx.carrierPhone?.trim() ? `Phone: ${ctx.carrierPhone}. ` : '';
      return `${hi} your order #${ctx.trackingCode} is on the way. ${carrier}${carrierPhone}Track: ${ctx.trackingUrl}`;
    }
    case 'delivered':
      return `${hi} your order #${ctx.trackingCode} has been delivered. Thank you for choosing ${ctx.businessName}.`;
    case 'cancelled':
      return `${hi} your order #${ctx.trackingCode} has been cancelled. Please contact ${ctx.businessName} if you have questions.`;
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ ok: false, reason: 'unauthorized' }, 401);
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
    );
    const { data: ures } = await userClient.auth.getUser();
    if (!ures?.user) return json({ ok: false, reason: 'unauthorized' }, 401);
    const callerId = ures.user.id;

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? '').trim();
    const eventRaw = String(body?.event ?? '').trim().toLowerCase(); // 'created' | 'status'
    const event = eventRaw === 'created' ? 'created' : 'status';
    if (!orderId) return json({ ok: false, reason: 'missing_order_id' }, 400);

    const admin = adminClient();
    const { data: order } = await admin
      .from('orders')
      .select('id, business_id, customer_name, customer_phone, status, tracking_code, carrier_name, carrier_phone')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return json({ ok: false, reason: 'order_not_found' });

    const businessId = order.business_id as string;

    // Authorize caller
    if (callerId !== businessId) {
      const { data: membership } = await admin
        .from('staff_members')
        .select('id, active')
        .eq('business_owner_id', businessId)
        .eq('staff_user_id', callerId)
        .eq('active', true)
        .maybeSingle();
      if (!membership) return json({ ok: false, reason: 'forbidden' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('business_name, sms_notify_order_status')
      .eq('id', businessId)
      .maybeSingle();
    if (profile?.sms_notify_order_status === false) {
      return json({ ok: false, reason: 'disabled' });
    }

    const phone = normalizePhone(String(order.customer_phone ?? ''));
    if (!/^\+\d{9,15}$/.test(phone)) return json({ ok: false, reason: 'no_valid_phone' });

    const trackingUrl = `${PUBLIC_BASE_URL}/track/${order.tracking_code}`;
    const message = statusMessage(order.status as string, {
      businessName: profile?.business_name?.trim() || 'the store',
      trackingUrl,
      carrierName: order.carrier_name as string | null,
      carrierPhone: order.carrier_phone as string | null,
      trackingCode: order.tracking_code as string,
      customerName: (order.customer_name as string) || 'there',
    });
    if (!message) return json({ ok: false, reason: 'no_message_for_status' });

    try {
      const provider = await sendAtSms(phone, message);
      await logSms({
        business_id: businessId,
        recipient_phone: phone,
        notification_type: event === 'created' ? 'order_confirmation' : 'order_status',
        message,
        status: 'sent',
        provider_response: provider,
        reference_id: order.id,
      });
      return json({ ok: true });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await logSms({
        business_id: businessId,
        recipient_phone: phone,
        notification_type: event === 'created' ? 'order_confirmation' : 'order_status',
        message,
        status: 'failed',
        error_message: errMsg,
        reference_id: order.id,
      });
      return json({ ok: false, reason: 'send_failed', error: errMsg });
    }
  } catch (err) {
    console.error('[send-order-sms] unexpected', err);
    return json({ ok: false, reason: 'unexpected_error' });
  }
});
