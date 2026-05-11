# SikaFlow Platform Features Plan

This is a large set of changes touching the header, super admin tools, realtime sync, and the Paystack payment flow. Below is the scoped plan grouped by feature.

## 1. Ads in Top Header

**Where:** `src/components/AppLayout.tsx` (top bar) — currently shows page title and notification/avatar.

**Build:**
- New component `src/components/HeaderAdsTicker.tsx` that:
  - Loads `platform_ads` where `active = true`, ordered by `sort_order`.
  - Subscribes to realtime changes on `platform_ads` so toggles by super admin appear instantly.
  - Rotates one ad at a time every ~6s with a fade transition.
  - Renders as a clickable pill (link opens external in new tab; in-app paths use `<Link>`).
  - Hidden on `<sm` screens (collapses gracefully) — title + bell stay intact on mobile.
- Insert between title and the right-side action cluster in `AppLayout` top bar.

## 2. Super Admin Delete User

**Where:** `src/pages/platform/BusinessesPage.tsx`.

**Build:**
- New edge function `supabase/functions/admin-delete-user` (service role) that:
  - Requires caller to have `super_admin` role.
  - Calls `supabase.auth.admin.deleteUser(userId)` — cascades remove auth user; `profiles` and tenant tables (which reference `user_id`) get cleaned via explicit `DELETE` per table OR rely on auth cascade where present. We'll explicitly delete from: `sales`, `sale_items`, `sale_documents`, `products`, `restocks`, `stock_movements`, `customers`, `expenses`, `other_income`, `savings`, `investments`, `investor_funding`, `bank_accounts`, `staff_invites`, `staff_members`, `subscription_payments`, `support_messages`, `audit_log`, `user_roles`, `profiles`, then auth user.
  - Allows the same email to sign up again afterward.
- Add "Delete user" button in BusinessesPage row with confirm dialog (typed email confirmation).

## 3. Realtime Admin → User

**Where:** `src/context/AuthContext.tsx` (or `SubscriptionContext.tsx`).

**Build:**
- Subscribe to `postgres_changes` on `profiles` filtered by `id=eq.<user.id>` and on `user_roles` filtered by `user_id=eq.<user.id>`.
- On any UPDATE/DELETE, refetch profile and roles. On profile DELETE → sign user out and redirect to `/sign-in`.
- Subscribe to `platform_ads` in the ads ticker (already in #1) so visibility is live.
- Subscribe to `subscription_payments` where `user_id=eq.<user.id>` to pop a toast when a payment is approved/rejected and refresh subscription status.

## 4 + 5 + 6. Paystack Auto-Activation, Security, Fallback

**Existing:** `supabase/functions/paystack-webhook` and `supabase/functions/paystack-payment` and `_shared/payment-utils.ts` (`activateSubscriptionForPayment`).

**Build:**
- Webhook (server-side trust):
  - Already verifies HMAC signature.
  - Add amount check: load `payment` row, compare event amount (GHS) to expected plan price; if mismatch → mark `failed` with note, do NOT activate.
  - Confirm metadata `user_id` matches payment row `user_id` (anti-tamper).
- New verification function `supabase/functions/paystack-verify` (called from frontend) that:
  - Accepts `reference`, calls Paystack `/transaction/verify/:reference` with secret key.
  - On `status=success` runs the same `activateSubscriptionForPayment` path (idempotent — checks if already activated).
  - Returns `{ status: 'pending' | 'active' | 'failed', expires_at }`.
- Frontend (`src/pages/BillingPage.tsx`):
  - After Paystack popup `onSuccess`, do NOT mark active locally. Show "Verifying payment…".
  - Poll `paystack-verify` every 3s up to 30s. Stop early when status is final.
  - Subscribe to realtime `subscription_payments` for instant flip via webhook.

## 7. Super Admin Payments View

**Where:** `src/pages/platform/PaymentsPage.tsx` (already exists).

**Build:**
- Ensure columns: business name, plan, amount, status badge (pending/success/failed), Paystack reference, created/reviewed at.
- Filter tabs: All / Pending / Successful / Failed.
- Realtime subscription on `subscription_payments` so admin view is live.

## Database changes

- Add `paystack_reference` column to `subscription_payments` if missing (the webhook reads it).
- Add `network` column if missing (used by webhook).
- Add an `email` column to `subscription_payments` only if needed for verify flow (skip if not).

## Technical notes (for implementation)

- Edge functions called from client: `admin-delete-user`, `paystack-verify`. Both require auth header validation (super_admin for delete; logged-in user for verify own payment).
- Use `supabaseAdmin` (service role) inside edge functions.
- Realtime: ensure the publication includes `profiles`, `user_roles`, `subscription_payments`, `platform_ads` (add via migration if not).
- Keep `verify_jwt = false` only for `paystack-webhook`; `admin-delete-user` and `paystack-verify` must verify JWT.

## Out of scope

- Existing UI of BillingPage stays; only the activation/verification flow changes.
- No changes to non-Paystack payment methods.

Confirm and I'll implement.