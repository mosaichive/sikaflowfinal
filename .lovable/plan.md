# SMS Notifications via Africa's Talking

Build customer thank-you SMS, low-stock alerts, and team invitation SMS on top of the existing `_shared/at-sms.ts` helper (already supports optional `AT_SENDER_ID`, E.164 normalization, server-side credentials, and friendly error mapping). No frontend keys, no changes to RLS, auth, sales math, or inventory math.

> Note: Africa's Talking is currently returning **401 Unauthorized** for the configured `AT_USERNAME=Portfolio` + `AT_API_KEY`. The feature will be wired end-to-end, but SMS will only actually deliver once a working legacy AT key is in place. All call sites are designed to fail soft so the app keeps working in the meantime.

## What gets built

### 1. Shared helper reuse
- Reuse `supabase/functions/_shared/at-sms.ts` (already handles optional sender, normalization, sandbox guard, friendly errors).
- Add a small `sms_logs` table + helper to record every send attempt.

### 2. New table: `sms_logs`
Columns: `business_id`, `recipient_phone`, `notification_type` (`sale_thanks` | `low_stock` | `team_invite`), `message_preview` (first 160 chars), `provider_response` (jsonb), `status` (`sent` | `failed`), `error_message`, `created_at`. RLS: owner reads own logs, service_role full access, no anon. Indexed on `(business_id, notification_type, created_at)` for cooldown lookups.

### 3. Notification preferences
Add three boolean columns to `profiles` (default `true`):
- `sms_notify_sale_thanks`
- `sms_notify_low_stock`
- `sms_notify_team_invite`

Surface toggles in **Settings → Notifications** (new card on existing SettingsPage).

### 4. Edge functions

**`send-sale-thanks-sms`** — called from client after a sale row is successfully inserted. Inputs: `sale_id`. Server loads sale + business name, checks preference + customer phone validity, sends, logs. Returns `{ ok, reason? }` — never throws to caller.

**`send-low-stock-alert`** — called from client after a stock-changing mutation (sale, restock cancellation). Inputs: `product_id`. Server checks: threshold set, current stock ≤ threshold, preference on, no `sent` log for this product in last 24h. Recipients: owner phone + active staff with inventory permission and a phone on file. Logs each recipient.

**`send-team-invite-sms`** — called from `StaffUsersPage` invite flow after `staff_invites` row is created. Inputs: `invite_id`, `phone`, `invite_url`. Validates phone, sends, logs. Failure does not roll back invite.

All three use `verify_jwt = false` default + in-code JWT validation against `SUPABASE_JWKS` (matching existing pattern in other functions), and use `supabaseAdmin` for reads.

### 5. Client wiring (presentation only)
- **SalesPage / record-sale flow**: after successful insert, fire-and-forget `supabase.functions.invoke('send-sale-thanks-sms', { body: { sale_id } })`. On `{ ok: false }` show toast "Sale saved, but SMS could not be sent." Do not block UI.
- **Inventory mutations** (sale insert, manual stock edit): same fire-and-forget to `send-low-stock-alert` per affected product.
- **StaffUsersPage invite dialog**: add optional phone field; after invite is created, invoke `send-team-invite-sms`. On failure toast: "Invitation created, but SMS could not be sent."
- **SettingsPage**: new "SMS Notifications" card with three switches bound to the new profile columns.

### 6. Phone normalization
Reuse `normalizePhone` from `_shared/at-sms.ts` server-side and `normalizeGhanaPhone` from `src/lib/phone-otp.ts` client-side for input validation feedback (rejecting invalid numbers before invoking).

### 7. Templates
- Sale: `Thank you for buying from {business}. Your purchase of GHS {amount} has been recorded. We appreciate your business.`
- Low stock: `Low stock alert: {product} has only {qty} left in {business}. Please restock soon.`
- Invite: `You have been invited to join {business} on KudiTrack. Accept here: {url}`

### 8. Out of scope (won't touch)
- RLS on existing tables, auth flows, sales/inventory calculations, permissions model, existing OTP functions, AT credentials themselves.

## Open question
The 401 from AT is unresolved (legacy key needed). Should I proceed building the full feature now so it's ready to flip on the moment the key works, or wait until SMS delivery is confirmed end-to-end first?
