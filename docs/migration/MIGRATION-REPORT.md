# KudiTrack — Lovable Cloud → External Supabase Migration Audit & Plan

**Status: AUDIT ONLY. Nothing in production was changed.** No DDL, no DML, no auth/storage/function changes were executed. All queries run for this report were read-only `SELECT`s against system catalogs and row counts.

Generated: 31 Aug 2026.

---

## 1. Current architecture

```text
Browser (React 18 + Vite 5 + TS, Tailwind, shadcn)
   |  @supabase/supabase-js  (src/integrations/supabase/client.ts)
   |  @lovable.dev/cloud-auth-js (Google OAuth only — src/integrations/lovable/index.ts)
   v
Lovable Cloud = managed Supabase project  ref: akmoxsaihexwjijtjzsj
   ├── Postgres 15 (public schema: 52 tables, 51 functions, 57 triggers, 185 RLS policies)
   ├── Auth (email+password, phone-OTP via custom functions, Google OAuth)
   ├── Storage (7 buckets, 46 objects, ~30 MB)
   ├── Edge Functions (35 deployed)
   ├── Realtime (16 public tables in supabase_realtime)
   └── pg_cron + pg_net (monthly statements scheduler)
Third parties: Paystack, Resend, Africa's Talking SMS, Twilio (WhatsApp OTP),
               Lovable AI Gateway (AI assistant), open.er-api.com (FX rates)
```

Extensions installed: `pgcrypto`, `uuid-ossp`, `pg_cron`, `pg_net`, `pg_stat_statements`, `supabase_vault`, `plpgsql`.

---

## 2. Database inventory

Full generated DDL: **`supabase/migration-package/01_schema.sql`** (3,246 lines) — enum types, all 52 tables with exact column types/defaults/nullability, all primary keys, unique constraints, check constraints, foreign keys, 119 indexes, 51 functions (with `security definer` + `search_path` preserved), 57 triggers, grants for `anon`/`authenticated`/`service_role`, `enable row level security`, 185 policies, and the realtime publication membership.

- **No views**, **no sequences/serial columns** — every PK is `uuid default gen_random_uuid()`. This removes the usual "sequence out of sync" migration risk entirely.
- Only one array column: `profiles.store_payment_methods text[]`.
- 6 enum types: `app_role`, `subscription_plan`, `subscription_status`, `savings_type`, `announcement_audience`, `announcement_priority`.

### Live row counts (data to preserve)

| Table | Rows | | Table | Rows |
|---|---:|---|---|---:|
| profiles | 36 | | sale_items | 848 |
| user_roles | 37 | | sale_documents | 67 |
| staff_members | 7 | | orders | 9 |
| staff_invites | 7 | | order_items | 9 |
| products | 184 | | expenses | 276 |
| customers | 13 | | other_income | 9 |
| sales | 802 | | savings | 120 |
| stock_movements | 1,080 | | bank_accounts | 10 |
| restocks | 224 | | subscription_payments | 7 |
| audit_log | 120 | | statement_deliveries | 36 |
| email_campaigns | 11 | | email_campaign_recipients | 115 |
| email_templates | 12 | | email_media_library | 5 |
| email_audit_log | 14 | | marketing_reviews | 5 |
| currencies | 30 | | exchange_rates | 30 |
| sms_logs | 65 | | signup_otps | 21 |
| surveys / questions / responses / answers / status | 1 / 9 / 2 / 18 / 20 | | restore_logs / restore_record_map | 1 / 248 |
| pricing_plans | 3 | | platform_ads | 3 |
| payment_methods | 2 | | platform_support_settings | 1 |
| announcements | 1 | | dashboard_preferences | 1 |
| statement_settings | 1 | | investments / investor_funding / referrals / referral_codes / ad_applications / feedback_messages / support_messages / email_marketing_unsubscribes | 0 |

Everything the user listed maps onto these tables. Notes on naming: there is **no separate `businesses` table** — a business *is* a `profiles` row (owner `auth.users.id` = `profiles.id`), and staff attach via `staff_members.business_owner_id`. There is no separate `categories` table (`products.category text`) and no separate damaged-goods table (damage is recorded as `stock_movements` with reason, see `src/lib/damaged-goods.ts`). Opening stock is `restocks.is_opening_stock`.

---

## 3. Authentication inventory

- Provider: **Supabase Auth**, in the Lovable-managed project. Application data keys off `auth.users.id` directly (`profiles.id`, `user_roles.user_id`, `expenses.user_id`, `sales.user_id`, `dashboard_preferences.user_id`, `sms_logs.business_id`, …).
- Methods in use:
  - Email + password (`supabase.auth.signInWithPassword` / `signUp`) — `src/pages/SignInPage.tsx`.
  - **Google OAuth** via `@lovable.dev/cloud-auth-js` (`src/integrations/lovable/index.ts`) — this is Lovable-specific and must be replaced by `supabase.auth.signInWithOAuth('google')` with your own Google client ID/secret.
  - Phone OTP login/signup and password reset via custom edge functions + `signup_otps` table (`phone-login-*`, `phone-signup-*`, `password-reset-*`, `resolve-phone-login`).
- Sessions: default supabase-js localStorage sessions; `record_user_login()` / `touch_user_activity()` update `profiles.last_login_at`, `last_activity_at`, `login_count`.
- Redirect URLs to reconfigure on the new project: `https://kuditrack.online`, `https://www.kuditrack.online`, `https://sikaflowfinal.lovable.app`, the Vercel preview domains, plus `/auth/callback`, `/invite/*`, `/reset-password`.
- **Password preservation:** `auth.users.encrypted_password` holds bcrypt hashes. A `pg_dump` of `auth.users` + `auth.identities` moves the hashes and the UUIDs verbatim, so **all existing users keep their password and their ID** — no reset emails needed. This is the only supported way; do not try to "recreate" users through the Admin API (it mints new UUIDs and would orphan every business record).
- Google-linked users additionally need `auth.identities` rows imported *and* the same Google OAuth client configured on the new project, otherwise the provider identity won't match.

---

## 4. Storage inventory

| Bucket | Public | Objects | Size | Referenced by |
|---|---|---:|---:|---|
| `business-logos` | yes | 6 | 2.0 MB | `profiles.logo_url` |
| `avatars` | yes | 11 | 2.8 MB | `profiles.avatar_url`, `marketing_reviews.avatar_url` |
| `platform-ads` | yes | 20 | 11 MB | `platform_ads.image_url`, `marketing_reviews.media_url` |
| `email-media` | no | 5 | 13 MB | `email_media_library.url` / `storage_path`, campaign HTML |
| `expense-receipts` | no | 1 | 493 kB | `expenses.attachment_path` |
| `other-income-receipts` | no | 0 | — | `other_income.attachment_path` |
| `database_export_05_08_26` | no | 1 | 1.6 MB | archive only |

24 policies exist on `storage.objects`; all are reproduced in `supabase/migration-package/02_storage.sql`.

**Reference risk:** public buckets are stored as *absolute URLs* containing the current project ref. After migration those columns need a one-time in-place URL host rewrite on the **new** database (script provided in the runbook, Phase 6). Private buckets store relative paths and need no rewrite.

---

## 5. Edge functions inventory (35)

All live under `supabase/functions/` in this repo, so they redeploy to a new project with `supabase functions deploy --project-ref <new>`. `supabase/config.toml` records the `verify_jwt=false` overrides (paystack-webhook, resolve-phone-login, submit-public-order, confirm-order-receipt, email-track-open, email-track-click, email-unsubscribe, admin-email-send-campaign, admin-monthly-statements, exchange-rates).

Grouped by purpose:

- **Payments (Paystack):** `paystack-init`, `paystack-payment`, `paystack-verify`, `paystack-webhook`, `manage-subscription` — need `PAYSTACK_SECRET_KEY`; webhook URL must be re-pointed in the Paystack dashboard at cutover.
- **Email (Resend):** `admin-email-send-campaign`, `admin-email-audience-preview`, `admin-monthly-statements`, `email-track-open`, `email-track-click`, `email-unsubscribe`, `sync-email-verification` — need `RESEND_API_KEY`, `SENDER_DOMAIN` (`mail.kuditrack.online`), `STATEMENTS_CRON_SECRET`/`STATEMENTS_CRON_TOKEN`, `PUBLIC_APP_URL`.
- **SMS (Africa's Talking + Twilio WhatsApp):** `send-order-sms`, `send-sale-thanks-sms`, `send-low-stock-alert`, `send-team-invite-sms`, `admin-send-sms`, `notify-admin-event`, `send-signup-otp`, `verify-signup-otp`, `phone-*-otp`, `password-reset-*-otp`, `resolve-phone-login` — need `AT_API_KEY`, `AT_SENDER_ID`, `SMS_ENABLED`, `SUPER_ADMIN_SMS_PHONE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.
- **Store / orders (public, unauthenticated):** `submit-public-order`, `confirm-order-receipt`.
- **Admin:** `admin-delete-user`, `manage-business-user`, `claim-referral`, `referrals-schema-check`.
- **Other:** `ai-assistant` (**Lovable AI Gateway — `LOVABLE_API_KEY`; this is the one integration with no external equivalent, see Blockers**), `exchange-rates` (open.er-api.com, no key).

Every function reads the platform-injected `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — those are auto-provided by any Supabase project, nothing to copy.

**Scheduled jobs:** the monthly statement run is driven by `pg_cron` + `pg_net` calling `admin-monthly-statements` with `STATEMENTS_CRON_SECRET`. The sandbox role cannot read `cron.job`, so **read `select * from cron.job` yourself with the postgres role and re-create the schedule on the new project** — this is a manual item.

---

## 6. Lovable Cloud-specific dependencies in the app

| Location | Dependency | Required change (NOT yet applied) |
|---|---|---|
| `src/integrations/supabase/client.ts` | Hardcoded fallback URL `https://akmoxsaihexwjijtjzsj.supabase.co` + anon key | Replace both constants with the new project's URL/anon key, or drop the fallback and require env vars |
| `src/integrations/lovable/index.ts` | `@lovable.dev/cloud-auth-js` Google sign-in | Replace with `supabase.auth.signInWithOAuth('google', { redirectTo: window.location.origin + '/auth/callback' })` |
| `src/pages/SignInPage.tsx` (lines ~158, ~316) | Imports `lovable.auth` | Point at the new helper |
| `package.json` | `@lovable.dev/cloud-auth-js` | Remove after the OAuth swap |
| `.env` / `.env.example` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | Repoint to the new project |
| `supabase/config.toml` | `project_id` | Set to the new ref |
| `src/integrations/supabase/types.ts` | Generated types | Regenerate against the new project (schema identical, so output should be byte-similar) |
| `src/integrations/supabase/client.server.ts` | Reads `SUPABASE_SERVICE_ROLE_KEY` | Unused by the SPA — delete, or keep strictly server-side; never bundle |

21 distinct `functions.invoke()` call sites — all resolved from the client URL, so no per-function URL edits are needed. Realtime channels use the `user:<uid>` topic convention (see project memory) and are covered by the publication statements in `01_schema.sql`.

---

## 7. Migration artifacts prepared

| File | Purpose |
|---|---|
| `supabase/migration-package/01_schema.sql` | Complete schema: extensions, enums, 52 tables, all constraints, 119 indexes, 51 functions, 57 triggers, grants, RLS + 185 policies, realtime publication |
| `supabase/migration-package/02_storage.sql` | Bucket creation + 24 storage policies |
| `supabase/migration-package/03_export_data.sh` | Read-only export from the current project (full `pg_dump` safety copy, auth data, public data, storage metadata, source fingerprint) |
| `supabase/migration-package/04_validation.sql` | Read-only fingerprint: per-table counts, auth/storage counts, financial checksums, orphan-row checks, RLS/function/trigger/index counts |
| `supabase/migration-package/05_import_data.sh` | Guarded import into the new project + automatic source/target diff |
| `supabase/migration-package/06_storage_sync.sh` | Copies every storage object to identical bucket + path |

---

## 8. Environment variables

**Vercel — frontend (public, `VITE_` prefixed, safe in the bundle):**
- `VITE_SUPABASE_URL` = `https://<new-ref>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = new anon/publishable key
- `VITE_SUPABASE_PROJECT_ID` = `<new-ref>`

That is the complete frontend set. **No other variable belongs on Vercel** — this is a pure SPA.

**Supabase Edge Function secrets (server-side only, never in Vercel/frontend):**
`PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`, `APP_PUBLIC_URL`, `STATEMENTS_CRON_SECRET`, `STATEMENTS_CRON_TOKEN`, `AT_API_KEY`, `AT_SENDER_ID`, `SMS_ENABLED`, `SUPER_ADMIN_SMS_PHONE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `LOVABLE_API_KEY` (AI assistant — see blockers).
Auto-injected by Supabase, do not set manually: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 9. Items requiring manual migration

1. **Secret values.** They cannot be read out of the current project; retrieve each from its own provider dashboard (Paystack, Resend, Africa's Talking, Twilio) and set them on the new project.
2. **`pg_cron` schedules.** Not readable by the audit role — dump `cron.job` with the postgres role and recreate.
3. **Google OAuth.** New client ID/secret configured on the new project's Google provider, plus the Lovable-auth code swap.
4. **Auth settings** not stored in the database: site URL, redirect allow-list, email templates, SMTP (Resend) settings, JWT expiry, rate limits, password policy, email-confirmation flags.
5. **Provider webhooks:** Paystack webhook URL, Resend webhook (open/click/bounce) URL.
6. **DNS / domain:** point `kuditrack.online` and `www` at Vercel at cutover; keep Resend's `mail.kuditrack.online` DKIM/SPF/DMARC/BIMI records untouched (they are domain-level, not project-level, so they survive).
7. **Public-bucket URL rewrite** in `profiles.logo_url`, `profiles.avatar_url`, `platform_ads.image_url`, `marketing_reviews.avatar_url/media_url`, `email_media_library.url`, and any campaign `body_html` containing the old ref.
8. **Vault secrets** (`supabase_vault`), if anything was stored there — not readable by the audit role.

---

## 10. Risks and blockers

| Risk | Severity | Mitigation |
|---|---|---|
| **Lovable AI Gateway (`LOVABLE_API_KEY`)** powers `ai-assistant`; it is tied to Lovable, not to Supabase | High | Either keep the key working post-migration, or repoint `ai-assistant` to a direct provider (OpenAI/Gemini) with your own key. Decide before cutover. |
| Google OAuth users cannot sign in until the new provider is configured with matching identities | High | Configure Google provider *before* cutover; test with a real Google account |
| Data written to the old DB during the cutover window is lost | High | Freeze writes: put the app in maintenance, then take the final export. Budget ~15 min given the small dataset (~5k rows, 30 MB). |
| Triggers re-firing during data import would double-post sales/stock ledgers | High | Import with `session_replication_role = replica` (already in `05_import_data.sh`) |
| Hardcoded old project URL/key fallback in `client.ts` silently keeps the app on the old backend | Medium | Remove the fallback in the same commit as the env swap |
| Absolute storage URLs break | Medium | URL rewrite step, Phase 6 |
| `pg_cron`/`pg_net` unavailable or disabled on the new project plan | Medium | Enable extensions in Phase 2 before schema import |
| `restore_record_map` / `restore_logs` reference historical restores | Low | Migrated as-is; no action |
| Email deliverability reputation | Low | Resend domain is unchanged, so reputation carries over |

---

## 11. Migration runbook

### PHASE 1 — Backup (no production change)
1. `cd supabase/migration-package && export SRC_DB_URL=... && bash 03_export_data.sh`
2. Verify `full-backup.dump` restores into a throwaway local Postgres.
3. Store `source-counts.txt` — it is the acceptance baseline.
4. Independently trigger the in-app Backup & Restore download (Settings → Backup) as a second copy.

### PHASE 2 — External Supabase setup
1. You create the project (region closest to Ghana; keep the DB password safe).
2. Enable extensions: `pgcrypto`, `uuid-ossp`, `pg_cron`, `pg_net`.
3. Set all edge-function secrets from §8.
4. Configure Auth: site URL, redirect allow-list, Google provider, Resend SMTP, email templates.
5. Do **not** touch the old project.

### PHASE 3 — Schema migration
`psql "$DST_DB_URL" -v ON_ERROR_STOP=1 -f 01_schema.sql` then `-f 02_storage.sql`. Fix any ordering error and re-run into a clean project; never patch by hand-editing the source.

### PHASE 4 — Data migration
Announce maintenance → freeze writes → re-run `03_export_data.sh` for the final snapshot → `bash 05_import_data.sh`. Confirm the source/target diff prints `MATCH ✅`.

### PHASE 5 — Authentication migration
Included in Phase 4 (`auth-data.sql` first, so FKs resolve). Then: verify `count.auth_users` matches, sign in with one email/password account and one Google account on a preview deployment.

### PHASE 6 — Storage migration
1. `bash 06_storage_sync.sh` (source untouched).
2. Verify object counts per bucket against `source-counts.txt`.
3. Rewrite public URLs **on the target only**:
```sql
-- run on TARGET only
update public.profiles set logo_url = replace(logo_url,'akmoxsaihexwjijtjzsj','<new-ref>') where logo_url like '%akmoxsaihexwjijtjzsj%';
update public.profiles set avatar_url = replace(avatar_url,'akmoxsaihexwjijtjzsj','<new-ref>') where avatar_url like '%akmoxsaihexwjijtjzsj%';
update public.platform_ads set image_url = replace(image_url,'akmoxsaihexwjijtjzsj','<new-ref>') where image_url like '%akmoxsaihexwjijtjzsj%';
update public.marketing_reviews set avatar_url = replace(avatar_url,'akmoxsaihexwjijtjzsj','<new-ref>'), media_url = replace(media_url,'akmoxsaihexwjijtjzsj','<new-ref>');
update public.products set image_url = replace(image_url,'akmoxsaihexwjijtjzsj','<new-ref>') where image_url like '%akmoxsaihexwjijtjzsj%';
update public.email_media_library set url = replace(url,'akmoxsaihexwjijtjzsj','<new-ref>');
update public.email_campaigns set body_html = replace(body_html,'akmoxsaihexwjijtjzsj','<new-ref>') where body_html like '%akmoxsaihexwjijtjzsj%';
```

### PHASE 7 — Functions / integrations
1. `supabase functions deploy --project-ref <new-ref>` (all 35; `config.toml` carries the `verify_jwt` overrides).
2. Recreate the `pg_cron` job for `admin-monthly-statements`.
3. Repoint Paystack + Resend webhooks — **after** cutover, or run both in parallel briefly.
4. Decide the `ai-assistant` provider.

### PHASE 8 — Application configuration
On a branch: swap the constants in `client.ts`, replace Lovable Google auth with `supabase.auth.signInWithOAuth`, drop `@lovable.dev/cloud-auth-js`, update `.env`/`.env.example`/`config.toml`, regenerate `types.ts`. Set the three `VITE_` vars in Vercel (Production + Preview) and deploy to a preview URL only.

### PHASE 9 — Testing (on the preview URL, new backend)
Sign in (password + Google + phone OTP), password reset, record a sale, restock, expense, damaged goods, customer, staff invite + accept, public store order + tracking + receipt confirmation, SMS delivery, Paystack test payment, email campaign send, monthly statement PDF, backup/restore, AI assistant, dashboard customization, realtime updates, and RLS isolation (log in as business A, confirm business B's data is invisible).

### PHASE 10 — Production cutover
Maintenance banner → final delta export/import (or accept the Phase 4 freeze) → point DNS to Vercel → promote the Vercel deployment → switch Paystack/Resend webhooks → smoke-test the live domain → lift maintenance → keep the old project running read-only for at least 14 days.

### PHASE 11 — Rollback plan (mandatory)
Rollback is cheap because the old project is never modified.
1. **Trigger:** any Phase 9/10 failure — auth failures, missing data, payment/webhook errors, RLS leakage.
2. **Action:** revert the Vercel env vars to the old `VITE_SUPABASE_URL`/key and redeploy the previous deployment (Vercel instant rollback), or revert DNS to `sikaflowfinal.lovable.app`.
3. Switch Paystack/Resend webhooks back to the old function URLs.
4. The old database, auth, storage and functions are untouched and still authoritative — no data restore is needed.
5. **Only** if writes already landed on the new backend after cutover: export the delta rows from the new DB (`created_at > cutover`) and replay into the old one before reverting; keep the cutover window short to keep this set empty.
6. Post-rollback: `full-backup.dump` from Phase 1 remains the last-resort restore path.

---

## 12. Confirmation

No production change was made: no schema modification, no data write, no auth/storage/function/secret change, no disconnection from Lovable Cloud, no new project created. Awaiting your explicit approval before any migration step is executed.
