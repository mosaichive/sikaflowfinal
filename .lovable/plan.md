## Scope

Nine additive changes across the Orders module, the public Store page, and the Tracking page. No destructive schema changes — every new column is nullable with a safe default; existing orders keep working unchanged.

## 1. Database migration (additive only)

New columns:
- `orders.delivery_fee numeric default 0`
- `orders.fulfillment_type text default 'delivery'` — `'pickup' | 'delivery'`
- `orders.customer_confirmed_at timestamptz`
- `orders.confirmation_token text` — random 24-char token, indexed
- `profiles.store_payment_methods text[] default '{cash_on_delivery}'` — subset of `cash_on_delivery`, `paystack`
- `profiles.store_payment_instructions text`
- `profiles.orders_auto_publish_products boolean default true`

New status value added to any status check: `'completed'` (kept alongside `'delivered'`). No enum change — `orders.status` is already a free text column, so this is safe.

Trigger updates:
- `tg_orders_set_confirmation_token` — fill `confirmation_token` on insert if null.

Update the two SECURITY DEFINER functions:
- `public_get_store(slug)` — when the owner has `orders_auto_publish_products = true`, return **all** non-archived products with a computed `available` boolean (`stock > 0` OR stock tracking disabled). Also return `payment_methods`, `payment_instructions`, `delivery_fee_default` (0 by default; per-order overrides live in the order row).
- `public_get_order_by_tracking(code)` — also return `delivery_fee`, `fulfillment_type`, `estimated_delivery_date` (already returned), and never return `confirmation_token`.

New SECURITY DEFINER function:
- `public_confirm_order_receipt(_code text, _phone_last4 text)` — verifies the last 4 digits of `customer_phone` match, sets `status = 'completed'`, `customer_confirmed_at = now()`. Returns `{ ok, business_id }` so the edge function can notify the owner.

## 2. Edge functions

- `submit-public-order` — accept `fulfillment_type`, `delivery_fee`, `estimated_delivery_date`. Enforce: pickup ⇒ delivery_fee = 0 and address optional; delivery ⇒ address required. Recompute total server-side. Customer confirmation SMS includes delivery date when set.
- `send-order-sms` — add message templates for `ready` and `completed`. Include delivery date in the pending/confirmed/out_for_delivery messages when present.
- New `confirm-order-receipt` (public, no JWT) — calls `public_confirm_order_receipt`, then sends "Order KT-XXX confirmed received by customer" SMS to owner + orders-permitted staff (reuses the recipient logic from `submit-public-order`, extracted to `_shared/order-recipients.ts`).

Register `confirm-order-receipt` in `supabase/config.toml` with `verify_jwt = false`.

## 3. Frontend — Orders module

- Rename the "Due Date" field label to **"Delivery Date"**; make it required when `fulfillment_type = 'delivery'`. Store in existing `estimated_delivery_date` column.
- Carrier section: add **Delivery Fee** input (number, GHS). Include in the total: `subtotal - discount + delivery_fee`.
- Add a **Fulfillment** selector (Pickup / Delivery) on the manual-order form for parity with the public form.
- New **Order Settings** dialog (gear icon on OrdersPage header): payment methods (checkboxes: Cash on Delivery, Paystack), payment instructions (textarea), online ordering toggle, auto-publish toggle, store link + copy, plus the store display prefs currently on the profile card. Writes to `profiles`.
- Show new statuses in the status filter and the status dropdown: add `completed`.

## 4. Frontend — Settings page

- Remove `OnlineStoreCard` from `SettingsPage`. Replace with a small stub: "Online store settings have moved to Orders → Settings" with a link. Keep the `profiles` columns for backward compat.

## 5. Frontend — Public Store (`StorePage.tsx`)

- Product cards render `Available` / `Out of Stock` badges from the server-computed `available` flag. Out-of-stock cards are unclickable and greyed.
- Checkout form: Full Name, Phone, **Fulfillment radio (Pickup / Delivery)**, Address (required only when Delivery), Notes, **Preferred Delivery Date** (required when Delivery).
- Delivery-fee line + total updates live when Delivery is chosen.
- Payment options block renders from `payment_methods` + `payment_instructions`.
- On success, clear cart and navigate to `/track/<code>` — the store never displays a list of past orders (isolation is automatic since state lives only in that browser session).

## 6. Frontend — Tracking (`TrackOrderPage.tsx`)

- Show fulfillment type, delivery date, delivery fee line, and full total breakdown.
- When status = `delivered` and not yet confirmed: show a **"I have received my order"** panel that asks for the last 4 digits of the phone, then calls `confirm-order-receipt`. On success, flip local state to `completed` and show a thank-you card + "Back to store" link back to `/store/<slug>` (captured from the tracking payload).
- When status = `completed`: read-only summary; the confirmation panel is gone.

## 7. Order isolation

Tracking is already scoped by tracking code (a 12-char random token) via the SECURITY DEFINER RPC — no policy loosening. The confirmation endpoint requires tracking code **plus** the last 4 phone digits, so a leaked code alone can't confirm receipt. Nothing on `/store/<slug>` lists any orders. `/track/<code>` never links to another order.

## Files touched

New:
- `supabase/functions/confirm-order-receipt/index.ts`
- `supabase/functions/_shared/order-recipients.ts`
- `src/components/orders/OrderSettingsDialog.tsx`

Edited:
- migration (additive)
- `supabase/config.toml` (register new function)
- `supabase/functions/submit-public-order/index.ts`
- `supabase/functions/send-order-sms/index.ts`
- `src/pages/OrdersPage.tsx` (Delivery Date label + required, Delivery Fee, Fulfillment selector, total recalc, Settings dialog trigger, `completed` status)
- `src/pages/SettingsPage.tsx` (remove OnlineStoreCard, add pointer)
- `src/pages/StorePage.tsx` (fulfillment, delivery date, delivery fee, payment options, availability badges)
- `src/pages/TrackOrderPage.tsx` (delivery date/fee display, receipt confirmation panel, back-to-store)
- `src/lib/constants.ts` (add `completed` to `ORDER_STATUSES`)
- `src/components/settings/OnlineStoreCard.tsx` — kept but only mounted in the new Orders Settings dialog

## Non-goals / safety

- Existing orders keep `fulfillment_type = 'delivery'` and `delivery_fee = 0` — totals unchanged.
- No Paystack wiring in checkout (per your answer). The Paystack option in Order Settings is stored but ignored by the public checkout for now; instructions text is shown either way.
- No changes to Sales, Inventory, Customers, Users, Business data, RLS on unrelated tables, or existing edge functions beyond the two named.
