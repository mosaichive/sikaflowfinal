// Public endpoint: customer confirms receipt of their order via tracking code.
// Marks the order 'completed' and notifies the business owner + staff with
// orders access by SMS. Fire-and-forget SMS.
import { normalizePhone, sendAtSms } from '../_shared/at-sms.ts';
import { adminClient, logSms } from '../_shared/sms-log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? '').trim();
    if (!code) return json({ ok: false, reason: 'missing_code' }, 400);

    const admin = adminClient();
    const { data: res, error } = await admin.rpc('public_confirm_order_receipt_by_code' as any, { _code: code });
    if (error) {
      console.error('[confirm-order-receipt] rpc error', error);
      return json({ ok: false, reason: 'rpc_error', error: error.message }, 500);
    }
    const r = res as any;
    if (!r?.ok) return json(r ?? { ok: false, reason: 'unknown' }, 400);

    if (!r.already) {
      const businessId = r.business_id as string;
      const orderId = r.order_id as string;
      const customerName = String(r.customer_name || 'A customer');
      const trackingCode = String(r.tracking_code || code);

      const { data: profile } = await admin
        .from('profiles')
        .select('business_name, phone, sms_notify_order_status')
        .eq('id', businessId)
        .maybeSingle();

      if ((profile as any)?.sms_notify_order_status !== false) {
        const businessName = (profile as any)?.business_name?.trim() || 'your store';
        const msg = `${customerName} confirmed delivery of order #${trackingCode}. It is now Completed on ${businessName}.`;

        const recipients = new Set<string>();
        const ownerPhone = normalizePhone(String((profile as any)?.phone ?? ''));
        if (/^\+\d{9,15}$/.test(ownerPhone)) recipients.add(ownerPhone);

        const { data: staff } = await admin
          .from('staff_members').select('staff_user_id, permissions, active')
          .eq('business_owner_id', businessId).eq('active', true);
        const staffIds: string[] = [];
        for (const s of staff ?? []) {
          const perms = (s as any).permissions || {};
          const modules: string[] = Array.isArray(perms.modules) ? perms.modules : [];
          if (modules.includes('orders') || perms.role === 'admin' || perms.role === 'manager') {
            if ((s as any).staff_user_id) staffIds.push((s as any).staff_user_id as string);
          }
        }
        if (staffIds.length > 0) {
          const { data: sp } = await admin.from('profiles').select('id, phone').in('id', staffIds);
          for (const p of sp ?? []) {
            const ph = normalizePhone(String((p as any).phone ?? ''));
            if (/^\+\d{9,15}$/.test(ph)) recipients.add(ph);
          }
        }

        for (const to of recipients) {
          try {
            const provider = await sendAtSms(to, msg);
            await logSms({ business_id: businessId, recipient_phone: to, notification_type: 'order_completed', message: msg, status: 'sent', provider_response: provider, reference_id: orderId });
          } catch (err) {
            await logSms({ business_id: businessId, recipient_phone: to, notification_type: 'order_completed', message: msg, status: 'failed', error_message: err instanceof Error ? err.message : String(err), reference_id: orderId });
          }
        }
      }
    }

    return json({ ok: true, already: !!r.already });
  } catch (err) {
    console.error('[confirm-order-receipt] unexpected', err);
    return json({ ok: false, reason: 'unexpected_error', error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
