// Public, unauthenticated endpoint for the online store checkout.
// Handles pickup + delivery orders, applies delivery fee for delivery orders,
// records the chosen payment method, and fires SMS notifications to the
// business owner + staff-with-orders-access. Fire-and-forget SMS.
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

const recentSubmissions = new Map<string, number>();
function dedupeKey(slug: string, phone: string, total: number) {
  return `${slug}|${phone}|${total.toFixed(2)}`;
}
function seenRecently(key: string) {
  const now = Date.now();
  for (const [k, t] of recentSubmissions) if (now - t > 60_000) recentSubmissions.delete(k);
  return recentSubmissions.has(key);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const slug = String(body?.slug ?? '').trim();
    const customerName = String(body?.customer_name ?? '').trim().slice(0, 120);
    const customerPhoneRaw = String(body?.customer_phone ?? '').trim();
    const deliveryLocation = String(body?.delivery_location ?? '').trim().slice(0, 500);
    const notes = String(body?.notes ?? '').trim().slice(0, 1000);
    const items = Array.isArray(body?.items) ? body.items : [];
    const fulfillmentType = String(body?.fulfillment_type ?? 'delivery').toLowerCase() === 'pickup' ? 'pickup' : 'delivery';
    const paymentMethodChoice = String(body?.payment_method ?? '').trim().toLowerCase();
    const paymentName = String(body?.payment_name ?? '').trim().slice(0, 120);
    const paymentReference = String(body?.payment_reference ?? '').trim().slice(0, 80);

    if (!slug || !customerName || !customerPhoneRaw || items.length === 0) {
      return json({ ok: false, reason: 'missing_fields' }, 400);
    }

    const customerPhone = normalizePhone(customerPhoneRaw);
    if (!/^\+\d{9,15}$/.test(customerPhone)) {
      return json({ ok: false, reason: 'invalid_phone' }, 400);
    }

    const admin = adminClient();

    const { data: profile } = await admin
      .from('profiles')
      .select('id, business_name, online_ordering_enabled, phone, sms_notify_new_order, store_default_delivery_fee, store_payment_methods, store_allow_pickup, store_allow_delivery, orders_auto_publish_products')
      .eq('store_slug', slug)
      .maybeSingle();
    if (!profile || profile.online_ordering_enabled !== true) {
      return json({ ok: false, reason: 'store_unavailable' }, 404);
    }
    const businessId = profile.id as string;

    if (fulfillmentType === 'pickup' && profile.store_allow_pickup === false) {
      return json({ ok: false, reason: 'pickup_disabled' }, 400);
    }
    if (fulfillmentType === 'delivery' && profile.store_allow_delivery === false) {
      return json({ ok: false, reason: 'delivery_disabled' }, 400);
    }
    if (fulfillmentType === 'delivery' && !deliveryLocation) {
      return json({ ok: false, reason: 'delivery_address_required' }, 400);
    }

    const productIds = items.map((it: any) => String(it?.product_id ?? '')).filter(Boolean);
    if (productIds.length === 0) return json({ ok: false, reason: 'invalid_items' }, 400);
    const { data: products } = await admin
      .from('products')
      .select('id, name, price, cost, stock, available_online, is_archived')
      .eq('user_id', businessId)
      .in('id', productIds);

    const autoPublish = profile.orders_auto_publish_products !== false;
    const productMap = new Map<string, any>((products ?? []).map((p: any) => [p.id, p]));
    const orderItems: any[] = [];
    let subtotal = 0;
    for (const raw of items) {
      const pid = String(raw?.product_id ?? '');
      const qty = Math.max(1, Math.floor(Number(raw?.quantity ?? 0)));
      const product = productMap.get(pid);
      if (!product || product.is_archived) {
        return json({ ok: false, reason: 'product_unavailable', product_id: pid }, 400);
      }
      if (!autoPublish && product.available_online !== true) {
        return json({ ok: false, reason: 'product_unavailable', product_id: pid }, 400);
      }
      if (Number(product.stock ?? 0) <= 0) {
        return json({ ok: false, reason: 'out_of_stock', product_id: pid }, 400);
      }
      const price = Number(product.price ?? 0);
      const line_total = price * qty;
      subtotal += line_total;
      orderItems.push({
        business_id: businessId,
        product_id: pid,
        product_name: product.name,
        quantity: qty,
        unit_price: price,
        cost_price: Number(product.cost ?? 0),
        line_total,
      });
    }

    // Delivery fee: applies only to delivery orders.
    const deliveryFee = fulfillmentType === 'delivery' ? Number(profile.store_default_delivery_fee ?? 0) : 0;
    const total = subtotal + deliveryFee;

    // Resolve payment method
    const allowedMethods: string[] = Array.isArray(profile.store_payment_methods) && profile.store_payment_methods.length > 0
      ? profile.store_payment_methods
      : ['cash_on_delivery'];
    let paymentMethod = 'cash';
    if (paymentMethodChoice === 'paystack' && allowedMethods.includes('paystack')) paymentMethod = 'paystack';
    else if (paymentMethodChoice === 'cash_on_delivery' || paymentMethodChoice === 'cash' || allowedMethods.includes('cash_on_delivery')) paymentMethod = 'cash';
    else if (allowedMethods.includes('paystack')) paymentMethod = 'paystack';

    const key = dedupeKey(slug, customerPhone, total);
    if (seenRecently(key)) return json({ ok: false, reason: 'duplicate_submission' }, 409);
    recentSubmissions.set(key, Date.now());

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({
        business_id: businessId,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_location: fulfillmentType === 'delivery' ? (deliveryLocation || null) : null,
        notes: notes || null,
        subtotal,
        discount: 0,
        delivery_fee: deliveryFee,
        fulfillment_type: fulfillmentType,
        total,
        amount_paid: 0,
        balance: total,
        payment_method: paymentMethod,
        payment_status: 'unpaid',
        status: 'pending',
        source: 'online',
        customer_payment_name: paymentName || null,
        customer_payment_reference: paymentReference || null,
        order_date: new Date().toISOString(),
      })
      .select('id, tracking_code')
      .single();

    if (orderErr || !order) {
      console.error('[submit-public-order] order insert failed', orderErr);
      return json({ ok: false, reason: 'order_create_failed', error: orderErr?.message }, 500);
    }

    const itemRows = orderItems.map((r) => ({ ...r, order_id: order.id }));
    const { error: itemsErr } = await admin.from('order_items').insert(itemRows);
    if (itemsErr) {
      console.error('[submit-public-order] items insert failed', itemsErr);
      await admin.from('orders').delete().eq('id', order.id);
      return json({ ok: false, reason: 'order_items_failed', error: itemsErr.message }, 500);
    }

    const trackingUrl = `${PUBLIC_BASE_URL}/track/${order.tracking_code}`;

    // Notify owner + staff-with-orders access
    if (profile.sms_notify_new_order !== false) {
      const businessName = profile.business_name?.trim() || 'your store';
      const itemCount = orderItems.reduce((s, r) => s + r.quantity, 0);
      const momoLine = paymentName || paymentReference
        ? ` Momo: ${paymentName || '—'}${paymentReference ? ` / Ref ${paymentReference}` : ''}.`
        : '';
      const summary = `New ${fulfillmentType} order from ${customerName} at ${businessName}. ${itemCount} item${itemCount === 1 ? '' : 's'}. GHS ${total.toFixed(2)}.${momoLine} Open KudiTrack to process.`;
      const recipients = new Set<string>();
      const ownerPhone = normalizePhone(String(profile.phone ?? ''));
      if (/^\+\d{9,15}$/.test(ownerPhone)) recipients.add(ownerPhone);

      const { data: staff } = await admin
        .from('staff_members')
        .select('staff_user_id, permissions, active')
        .eq('business_owner_id', businessId)
        .eq('active', true);
      const staffIds: string[] = [];
      for (const s of staff ?? []) {
        const perms = (s as any).permissions || {};
        const modules: string[] = Array.isArray(perms.modules) ? perms.modules : [];
        if (modules.includes('orders') || perms.role === 'admin' || perms.role === 'manager') {
          if (s.staff_user_id) staffIds.push(s.staff_user_id as string);
        }
      }
      if (staffIds.length > 0) {
        const { data: staffProfiles } = await admin.from('profiles').select('id, phone').in('id', staffIds);
        for (const sp of staffProfiles ?? []) {
          const p = normalizePhone(String((sp as any).phone ?? ''));
          if (/^\+\d{9,15}$/.test(p)) recipients.add(p);
        }
      }

      for (const to of recipients) {
        try {
          const provider = await sendAtSms(to, summary);
          await logSms({ business_id: businessId, recipient_phone: to, notification_type: 'new_order', message: summary, status: 'sent', provider_response: provider, reference_id: order.id });
        } catch (err) {
          await logSms({ business_id: businessId, recipient_phone: to, notification_type: 'new_order', message: summary, status: 'failed', error_message: err instanceof Error ? err.message : String(err), reference_id: order.id });
        }
      }
    }

    // Customer confirmation SMS
    const businessName = profile.business_name?.trim() || 'the store';
    const customerMsg = `Hi ${customerName}, your ${fulfillmentType} order (#${order.tracking_code}) at ${businessName} has been received. Track it: ${trackingUrl}`;
    try {
      const provider = await sendAtSms(customerPhone, customerMsg);
      await logSms({ business_id: businessId, recipient_phone: customerPhone, notification_type: 'order_confirmation', message: customerMsg, status: 'sent', provider_response: provider, reference_id: order.id });
    } catch (err) {
      await logSms({ business_id: businessId, recipient_phone: customerPhone, notification_type: 'order_confirmation', message: customerMsg, status: 'failed', error_message: err instanceof Error ? err.message : String(err), reference_id: order.id });
    }

    return json({ ok: true, tracking_code: order.tracking_code, tracking_url: trackingUrl });
  } catch (err) {
    console.error('[submit-public-order] unexpected', err);
    return json({ ok: false, reason: 'unexpected_error', error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
