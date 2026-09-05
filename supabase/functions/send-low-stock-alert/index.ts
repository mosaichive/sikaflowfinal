// Sends a low-stock SMS alert to the business owner (and any active staff
// with the `inventory` module + a phone on file). Deduped via a 24h cooldown
// per product, scanning the sms_logs table for recent `sent` rows.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { normalizePhone, sendAtSms } from '../_shared/at-sms.ts';
import { adminClient, logSms } from '../_shared/sms-log.ts';
import { consumeRateLimit } from '../_shared/rate-limit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
    const callerId = ures.user.id;

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.product_id ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(productId)) return json({ ok: false, reason: 'invalid_product_id' }, 400);

    const withinLimit = await consumeRateLimit({
      req,
      action: 'low_stock_sms',
      entity: `${callerId}|${productId}`,
      limit: 5,
      windowSeconds: 600,
    });
    if (!withinLimit) return json({ ok: false, reason: 'rate_limited' }, 429);

    const admin = adminClient();
    const { data: product } = await admin
      .from('products')
      .select('id, business_id, name, stock, low_stock_threshold')
      .eq('id', productId)
      .maybeSingle();
    if (!product) return json({ ok: false, reason: 'product_not_found' });

    const threshold = Number(product.low_stock_threshold ?? 0);
    const stock = Number(product.stock ?? 0);
    if (!threshold || threshold <= 0) return json({ ok: false, reason: 'no_threshold' });
    if (stock > threshold) return json({ ok: false, reason: 'above_threshold' });

    const businessId = product.business_id as string;
    const { data: business } = await admin
      .from('businesses')
      .select('id, owner_user_id, name')
      .eq('id', businessId)
      .maybeSingle();
    if (!business?.owner_user_id) return json({ ok: false, reason: 'business_not_found' }, 404);

    if (callerId !== business.owner_user_id) {
      const { data: membership } = await admin
        .from('staff_members')
        .select('permissions')
        .eq('business_id', businessId)
        .eq('staff_user_id', callerId)
        .eq('active', true)
        .maybeSingle();
      const permissions = membership?.permissions as { role?: string; modules?: string[] } | null;
      const allowed = permissions?.role === 'admin' || permissions?.role === 'manager' ||
        (Array.isArray(permissions?.modules) && permissions.modules.includes('inventory'));
      if (!allowed) return json({ ok: false, reason: 'forbidden' }, 403);
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('business_name, phone, sms_notify_low_stock')
      .eq('user_id', business.owner_user_id)
      .maybeSingle();
    if (profile && profile.sms_notify_low_stock === false) {
      return json({ ok: false, reason: 'disabled' });
    }

    // 24h cooldown per product
    const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const { data: recent } = await admin
      .from('sms_logs')
      .select('id')
      .eq('business_id', businessId)
      .eq('notification_type', 'low_stock')
      .eq('reference_id', product.id)
      .eq('status', 'sent')
      .gte('created_at', since)
      .limit(1);
    if (recent && recent.length > 0) return json({ ok: false, reason: 'cooldown' });

    // Collect recipients: owner + active inventory staff with a phone
    const recipients = new Map<string, string>(); // normalized phone -> raw
    if (profile?.phone) {
      const n = normalizePhone(profile.phone);
      if (/^\+\d{9,15}$/.test(n)) recipients.set(n, profile.phone);
    }

    const { data: staff } = await admin
      .from('staff_members')
      .select('staff_user_id, permissions, active')
      .eq('business_id', businessId)
      .eq('active', true);
    const staffIds = (staff ?? [])
      .filter((s: any) => {
        const mods = (s.permissions?.modules ?? []) as string[];
        return Array.isArray(mods) && mods.includes('inventory');
      })
      .map((s: any) => s.staff_user_id);
    if (staffIds.length > 0) {
      const { data: staffProfiles } = await admin
        .from('profiles')
        .select('user_id, phone')
        .in('user_id', staffIds);
      for (const sp of staffProfiles ?? []) {
        if (!sp.phone) continue;
        const n = normalizePhone(sp.phone);
        if (/^\+\d{9,15}$/.test(n)) recipients.set(n, sp.phone);
      }
    }

    if (recipients.size === 0) return json({ ok: false, reason: 'no_recipients' });

    const businessName = profile?.business_name?.trim() || business.name?.trim() || 'your business';
    const message = `Low stock alert: ${product.name} has only ${stock} left in ${businessName}. Please restock soon.`;

    let sentCount = 0;
    for (const phone of recipients.keys()) {
      try {
        const provider = await sendAtSms(phone, message);
        sentCount++;
        await logSms({
          business_id: businessId,
          recipient_phone: phone,
          notification_type: 'low_stock',
          message,
          status: 'sent',
          provider_response: provider,
          reference_id: product.id,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[send-low-stock-alert] send failed', err instanceof Error ? err.name : 'unknown_error');
        await logSms({
          business_id: businessId,
          recipient_phone: phone,
          notification_type: 'low_stock',
          message,
          status: 'failed',
          error_message: errMsg,
          reference_id: product.id,
        });
      }
    }

    return json({ ok: sentCount > 0, sent: sentCount });
  } catch (err) {
    console.error('[send-low-stock-alert] unexpected', err);
    return json({ ok: false, reason: 'unexpected_error' });
  }
});
