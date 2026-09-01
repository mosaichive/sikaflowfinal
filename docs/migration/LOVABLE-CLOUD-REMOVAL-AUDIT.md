# KudiTrack — Lovable Cloud removal audit & migration

Target backend: Supabase project `aburrrtibnvtonemuzmo` (existing production schema — untouched).
Frontend: Vite/React on Vercel (`https://sikaflowsystem.vercel.app`), repo `mosaichive/sikaflowfinal`.

## 1. Audit — where Lovable Cloud was used

| Area | Location | Status |
|---|---|---|
| Auth broker package | `@lovable.dev/cloud-auth-js` in `package.json` | **removed** (`bun remove`) |
| Auth wrapper | `src/integrations/lovable/index.ts`, `cloud-auth-stub.ts` | **deleted** |
| Google sign-in call sites | `src/pages/SignInPage.tsx` (2) | now `signInWithOAuth()` → `supabase.auth.signInWithOAuth` |
| Build alias for the broker | `vite.config.ts` | **removed**; config is plain Vite now |
| Email delivery via Lovable connector gateway | `_shared/resend-direct.ts` (`connector-gateway.lovable.dev`, `LOVABLE_API_KEY`) | **removed**; always direct to `api.resend.com` |
| Email functions gating on `LOVABLE_API_KEY` | `admin-email-send-campaign`, `admin-monthly-statements` | **removed**; only `RESEND_API_KEY` required |
| AI Gateway | `ai-assistant/index.ts` (`ai.gateway.lovable.dev`, `LOVABLE_API_KEY`) | **removed**; now uses `_shared/ai-provider.ts` (`AI_PROVIDER=disabled` by default, `openai_compatible` opt-in) |
| Hardcoded Lovable DB URL/anon key | `src/integrations/supabase/client.ts` | already removed earlier; env-only, fails fast if unset |
| Service-role client in `src/` | `client.server.ts` | deleted earlier |

Repo scan result: **zero** `lovable` references remain in `src/`, `index.html`, `vite.config.ts`,
`vercel.json`, `public/`, `package.json` or `supabase/functions/` (only historical migration docs mention it).

## 2. Supabase features already connected (unchanged)

- **Client**: `src/integrations/supabase/client.ts` — the single client, env-driven.
- **Auth**: `AuthContext.tsx` (email/password, phone-password via `resolve-phone-login`, OTP flows,
  Google OAuth), `AuthCallbackPage`, `InviteAcceptPage`, password reset OTP functions.
- **Database**: 52 tables (profiles, sales, sale_items, orders, order_items, products, customers,
  expenses, other_income, savings, investments, bank_accounts, restocks, stock_movements,
  subscriptions/payments, staff, referrals, email/campaign tables, surveys, currencies …) with
  185 RLS policies, 57 triggers and the SECURITY DEFINER functions the app calls
  (`has_role`, `public_get_store`, `public_get_order_by_tracking`, `restore_business_backup`,
  `sync_offline_*`, `ensure_referrals_columns`, …).
- **Storage**: 7 buckets (logos/avatars, product images, attachments, email media, review media).
- **Edge Functions**: ~40 functions under `supabase/functions/` (`supabase/config.toml`
  already points at `project_id = "aburrrtibnvtonemuzmo"`).

## 3. Required configuration in project `aburrrtibnvtonemuzmo`

**Vercel env vars** (Production, Preview, Development):

```
VITE_SUPABASE_URL=https://aburrrtibnvtonemuzmo.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon/publishable key>
VITE_SUPABASE_PROJECT_ID=aburrrtibnvtonemuzmo
```

No service-role key in the frontend. `VITE_AUTH_PROVIDER` is no longer read — delete it if set.

**Supabase Auth**: enable Google, add Site URL `https://sikaflowsystem.vercel.app` and redirect
URLs for `https://kuditrack.online`, `https://www.kuditrack.online`, `/auth/callback`,
`/invite/*`, and Vercel preview hosts. Reusing the same Google Cloud OAuth client preserves
existing `sub` values so current Google users keep their accounts.

**Edge function secrets**: `RESEND_API_KEY`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`, `PAYSTACK_*`,
`TWILIO_*`/SMS provider keys, `STATEMENTS_CRON_SECRET`, `EMAIL_CRON_SECRET`,
optionally `AI_PROVIDER` + `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`.
`LOVABLE_API_KEY` and `EMAIL_TRANSPORT` are no longer used by any code path.

**Extensions/cron**: enable `pg_cron` + `pg_net`, then run `supabase/migration-package/07_cron.sql`
with the new project ref for scheduled campaigns and monthly statements.

## 4. Risks to existing data

- No DDL, no data deletion and no schema recreation was performed by this change — it is a
  code-only migration.
- Users signing in with **email/password or phone** are unaffected. Users who only ever used
  **Google** must have the Google provider configured with the same OAuth client, otherwise
  a new `sub` creates duplicate accounts.
- Storage URLs stored as absolute strings in the database must point at the
  `aburrrtibnvtonemuzmo` project; rewrite any rows still holding an old project ref.
- The AI assistant returns its "not enabled" reply (client falls back to the offline parser)
  until `AI_PROVIDER` is configured.

## 5. Note about the Lovable preview

The in-editor preview injects its own `.env`, so the preview sandbox still points at the old
Cloud project. Production behaviour is defined entirely by the Vercel env vars above — the code
no longer contains any Lovable endpoint, key or package.
