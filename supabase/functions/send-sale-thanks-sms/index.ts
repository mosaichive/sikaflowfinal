// Sends a thank-you SMS to the customer after a sale is recorded.
// Never throws to the caller — returns { ok, reason? } so the UI can show
// a soft toast without blocking the sale flow.
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

    const body = await req.json().catch(() => ({}));
    const saleId = String(body?.sale_id ?? '').trim();
    if (!saleId) return json({ ok: false, reason: 'missing_sale_id' }, 400);

    const admin = adminClient();
    const { data: sale, error: saleErr } = await admin
      .from('sales')
      .select('id, user_id, total, customer_phone, customer_name')
      .eq('id', saleId)
      .maybeSingle();
    if (saleErr || !sale) return json({ ok: false, reason: 'sale_not_found' });

    const ownerId = sale.user_id as string;
    const { data: profile } = await admin
      .from('profiles')
      .select('business_name, sms_notify_sale_thanks')
      .eq('id', ownerId)
      .maybeSingle();

    if (profile && profile.sms_notify_sale_thanks === false) {
      return json({ ok: false, reason: 'disabled' });
    }

    const phone = normalizePhone(String(sale.customer_phone ?? ''));
    if (!phone || !/^\+\d{9,15}$/.test(phone)) {
      return json({ ok: false, reason: 'no_valid_phone' });
    }

    const businessName = profile?.business_name?.trim() || 'our store';
    const amount = Number(sale.total ?? 0).toFixed(2);
    const message = `Thank you for buying from ${businessName}. Your purchase of GHS ${amount} has been recorded. We appreciate your business.`;

    try {
      const provider = await sendAtSms(phone, message);
      await logSms({
        business_id: ownerId,
        recipient_phone: phone,
        notification_type: 'sale_thanks',
        message,
        status: 'sent',
        provider_response: provider,
        reference_id: sale.id,
      });
      return json({ ok: true });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[send-sale-thanks-sms] send failed', errMsg);
      await logSms({
        business_id: ownerId,
        recipient_phone: phone,
        notification_type: 'sale_thanks',
        message,
        status: 'failed',
        error_message: errMsg,
        reference_id: sale.id,
      });
      return json({ ok: false, reason: 'send_failed', error: errMsg });
    }
  } catch (err) {
    console.error('[send-sale-thanks-sms] unexpected', err);
    return json({ ok: false, reason: 'unexpected_error' });
  }
});
