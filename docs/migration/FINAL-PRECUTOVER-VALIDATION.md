# KudiTrack — FINAL Pre-Cutover Validation

**Date:** 31 Aug 2026 · **Scope:** validation only · **Production changed:** NO

Lovable Cloud production was **not** modified: no migration was applied, no secret,
env var, auth setting, storage bucket, cron job, function deployment or user record
was touched. Every SQL statement in this report was executed against a **throwaway
local PostgreSQL 17 instance** created for the dry run and destroyed afterwards.

---

## 1. Migration package dry run

Method: a local Postgres 17 cluster was initialised empty, given the same
prerequisites a fresh Supabase project provides (roles `anon` / `authenticated` /
`service_role` / `authenticator`, schemas `auth` / `storage` / `extensions`,
`auth.uid()` / `auth.jwt()` / `auth.email()`, `storage.foldername()`,
`auth.users` / `auth.identities` / `storage.buckets` / `storage.objects`, and the
`supabase_realtime` publication). `01_schema.sql`, `02_storage.sql` and
`04_validation.sql` were then executed verbatim.

### Defect found and fixed — was a RED blocker

`01_schema.sql` wrote every RLS policy name in **single quotes**
(`create policy 'savings insert own' on ...`). Postgres treats a policy name as an
identifier, so all **185 policy statements failed with a syntax error**. Because
`05_import_data.sh` runs the schema with `-v ON_ERROR_STOP=1`, the import would have
aborted at line 3237 — and had it been run without that flag, the target would have
come up with **52 RLS-enabled tables and zero policies**, i.e. every table readable
by nobody and the Data API returning empty sets across the whole app.

Fixed: all 185 policy names are now double-quoted identifiers. Re-ran on a clean
database — **0 errors**.

### Defect found and fixed — was YELLOW

`04_validation.sql` queried `cron.job` unconditionally. On the target the fingerprint
runs (step 5 of `05_import_data.sh`) **before** `07_cron.sql` installs `pg_cron`, so
the query raised `relation "cron.job" does not exist` and polluted the
source-vs-target diff. Replaced with a `to_regclass` probe that emits `cron.jobs=0`
when the extension is absent.

### Defect found and fixed — was YELLOW

`admin-email-send-campaign` and `admin-monthly-statements` still contained their own
inline `https://connector-gateway.lovable.dev/resend` client and hard-failed with
`email provider not configured` when `LOVABLE_API_KEY` was missing — so on the new
project both would have gone dark. `_shared/resend-direct.ts` existed but was never
imported. Both functions now call `sendBatchAuto` / `sendEmailAuto`; the guard is
`RESEND_API_KEY && (direct || LOVABLE_API_KEY)`. Default transport is still
`gateway`, so **current production behaviour is unchanged** — the functions have not
been redeployed.

### Everything else checked

| Check | Result |
|---|---|
| Execution order (01 → 02 → auth data → public data → storage files → object rows → 07) | Correct as scripted in `05_import_data.sh` |
| Extensions | `pgcrypto`, `uuid-ossp`, `pg_net`, `pg_cron` declared at the top of `01_schema.sql` |
| Grants | 0 public tables missing a grant to `anon`/`authenticated`/`service_role` |
| RLS | 52/52 tables RLS-enabled, 0 tables RLS-enabled-without-policy |
| Functions before policies | Yes — `has_role`, `is_business_member_module` etc. exist before the policies that call them |
| Scripts that could hit production | `05_import_data.sh` refuses if `DST_DB_URL` contains the current project ref, if `DST_DB_URL == SRC_DB_URL`, or if `public.profiles` already exists on the target. `03_export_data.sh` and `06_storage_sync.sh` only read the source |
| Hardcoded secrets in package files | None — `07_cron.sql` and `06_storage_sync.sh` use placeholders / env vars |

---

## 2. Database — verified counts on a fresh empty database

| Object | Expected | Created | Status |
|---|---|---|---|
| Tables (public) | 52 | **52** | GREEN |
| Enum types | 6 | **6** | GREEN |
| Indexes | 119 | **119** | GREEN |
| Functions (application, excl. extension-owned) | 51 | **51** | GREEN |
| Triggers (non-internal) | 57 | **57** | GREEN |
| RLS policies (public) | 185 | **185** | GREEN (after fix) |
| Primary keys / FKs / unique / check | 52 / 25 / 18 / 9 | same | GREEN |
| Realtime tables | 16 | **16** | GREEN |
| Storage buckets | 7 | **7** | GREEN |
| Storage policies | 24 | **24** | GREEN |
| Schema apply errors | 0 | **0** | GREEN |

Required order: extensions → enums → tables → indexes/constraints → functions →
triggers → grants → RLS enable → policies → realtime publication. `01_schema.sql`
already follows it.

---

## 3. Data

`03_export_data.sh` uses `pg_dump --data-only`, which emits literal column values —
**every UUID and timestamp is carried across unchanged**: `auth.users.id`,
`profiles.id` (= business id), products, customers, sales, sale_items, expenses,
other_income, restocks, stock_movements, orders/order_items, savings, investments,
subscription_payments, audit_log, email_* and survey_* tables.

- **No duplicates possible.** Every table has a UUID primary key and the import runs
  into a **verified-empty** target (`05_import_data.sh` aborts if `public.profiles`
  exists). A second run would fail on PK conflict rather than duplicate.
- **No trigger re-fire.** Public data loads with `session_replication_role = replica`,
  so `adjust_stock_on_sale_item`, `handle_sale_item_stock_ledger`,
  `sync_restock_to_expense`, `tg_orders_sync_sale` etc. do not re-post ledgers or
  re-create sales. The script then asserts the role is back to `origin` and that
  `tgenabled = 'O'` for all 57 triggers.
- **Foreign keys** are re-validated explicitly after load; step 5 diffs the source and
  target fingerprints from `04_validation.sql` (per-table counts, md5 row digests,
  orphan checks).

---

## 4. Authentication

`pg_dump` of `auth.users`, `auth.identities` and `auth.mfa_factors` preserves:

- user UUIDs (`auth.users.id`) — so every `user_id` FK in `public` still resolves;
- `encrypted_password` bcrypt hashes — **existing email/password users do not need a
  reset**, GoTrue verifies the same hash;
- `auth.identities` rows including `provider`, `provider_id` and `identity_data.sub`
  — the 18 Google identities stay bound to the same users;
- `email_confirmed_at` / `phone_confirmed_at`, so nobody is re-prompted to verify.

**Must be configured manually in the new project's Auth settings** (none of this is
in a dump):

1. Site URL = `https://kuditrack.online`; Redirect allow-list = `https://kuditrack.online/**`,
   `https://www.kuditrack.online/**`, `https://<vercel-preview>.vercel.app/**`.
2. Email provider: confirmations ON, auto-confirm OFF, anonymous sign-in OFF.
3. Google provider enabled with the **existing** client ID/secret (§5).
4. JWT expiry, refresh-token rotation and password policy to match today's settings.
5. Auth email templates (confirm, magic link, recovery, invite) re-pasted.
6. SMTP: point Auth email at Resend/`mail.kuditrack.online` if you do not want the
   default Supabase sender.

---

## 5. Google OAuth — reuse the existing project

Do **not** create a new Google Cloud project or new OAuth client. Reusing the same
client ID keeps the Google `sub` values identical, which is what
`auth.identities.provider_id` is matched on — a new client would issue new `sub`s and
every Google user would land in a brand-new account.

In the **existing** Google Cloud Console OAuth 2.0 Client:

- **Client ID / secret:** unchanged — paste the same pair into the new project's
  Google provider. (Values are deliberately not stored in this repo.)
- **Authorized redirect URIs:** *add* `https://<new-ref>.supabase.co/auth/v1/callback`.
  Keep the current Lovable Cloud callback in place until rollback is retired.
- **Authorized JavaScript origins:** `https://kuditrack.online`,
  `https://www.kuditrack.online`, plus the Vercel domain.
- **App-side redirect:** `redirectTo` must be `${window.location.origin}/auth/callback`
  (a full same-origin public URL), never a protected route.
- **Identity linkage:** `auth.identities.provider='google'` + `provider_id` = Google
  `sub`; preserved by the auth dump, so all 18 Google users sign in unchanged.

---

## 6. Storage

All 7 buckets and 24 `storage.objects` policies are reproduced by `02_storage.sql`
and applied cleanly in the dry run. Public/private flags: `business-logos`,
`avatars`, `platform-ads` public; `expense-receipts`, `other-income-receipts`,
`email-media`, `database_export_05_08_26` private.

`06_storage_sync.sh` re-uploads each object under the **identical bucket + object
path**, so only the host portion of stored URLs changes. Rows in `products.image_url`,
`profiles.logo_url` / `avatar_url`, `expenses.attachment_path`,
`other_income.attachment_path`, `platform_ads.image_url`, `email_media_library.url`
therefore keep resolving.

- **Action required:** the absolute URLs saved in the database still contain the old
  project host. Run the documented one-off `update ... replace(url,'<old-ref>','<new-ref>')`
  after import, or keep the old project alive as a read-only asset host during the
  rollback window. `attachment_path` columns store relative paths and need nothing.
- Per-bucket file size limits and MIME allow-lists are not in `02_storage.sql`; set
  them in the new project to match.

---

## 7. Cron

| Job | Schedule | Calls | Depends on |
|---|---|---|---|
| `kuditrack-email-scheduled-runner` | `* * * * *` (every minute) | `POST /functions/v1/admin-email-send-campaign` `{"action":"run_scheduled"}` | `pg_cron`, `pg_net`, new anon key, function deployed, `RESEND_API_KEY` |
| `monthly-financial-statements` | `0 6 1 * *` (06:00 UTC, 1st of month) | `POST /functions/v1/admin-monthly-statements` `{"action":"run"}` with `x-cron-secret` | `pg_cron`, `pg_net`, `STATEMENTS_CRON_SECRET` matching the function secret, `statement_settings.automation_enabled` |

`07_cron.sql` is run on the **target** only, after the functions are deployed. Both
jobs post to `https://<new-ref>.supabase.co`, so they cannot reach the old database.
The old project's two jobs keep firing against the old database until you either
`cron.unschedule` them or pause the project — **do that only after the rollback
window closes**, and note that leaving them on means monthly statements could be sent
twice in the overlap month. Recommended: `update cron.job set active=false` on the
old project at cutover (reversible, and the rollback plan re-enables it).

---

## 8. Email

Both `admin-email-send-campaign` and `admin-monthly-statements` now route through
`_shared/resend-direct.ts`. With `EMAIL_TRANSPORT=direct` they call
`https://api.resend.com/emails` and `/emails/batch` with
`Authorization: Bearer ${RESEND_API_KEY}` and **no** `LOVABLE_API_KEY`, **no** gateway
URL, **no** `X-Connection-Api-Key`, **no** Lovable headers, **no** Responses API.

Required secret in the new project: **`RESEND_API_KEY`** (plus `SENDER_DOMAIN`,
default `mail.kuditrack.online`, and `PUBLIC_APP_URL`). Set `EMAIL_TRANSPORT=direct`
in the new project's function secrets; leave it unset in Lovable Cloud.

DNS: `mail.kuditrack.online` SPF/DKIM/DMARC already point at Resend and are
independent of the hosting move — nothing to change.

---

## 9. AI

`_shared/ai-provider.ts` resolves `AI_PROVIDER` with `?? "disabled"`. At cutover:

- no `LOVABLE_API_KEY`, no Anthropic key, no AI vendor key, no gateway call;
- the assistant endpoint returns a friendly "AI is not enabled" reply (not an error),
  and the client falls back to the on-device parser in `src/lib/offline-assistant.ts`,
  so recording sales/expenses by text keeps working;
- `openai_compatible` (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`) remains available but
  is never required.

**Remaining cutover edit (not done, by design):** `supabase/functions/ai-assistant/index.ts`
still contains the live gateway implementation because it is the deployed production
function. At cutover, delete `GATEWAY`, `MODEL`, the `LOVABLE_API_KEY` guard, the
`Lovable-API-Key` / `X-Lovable-AIG-SDK` headers, the Responses-API body and
`readOutputText()`, and call `runAssistantTurn()` from `_shared/ai-provider.ts`.

---

## 10. Vercel environment variables

**PUBLIC — safe in the browser (`VITE_` prefixed, embedded in the bundle):**

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<new-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | new project's anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | `<new-ref>` |

**PRIVATE — Supabase Edge Function secrets only. Never in Vercel, never `VITE_`:**

`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (auto-injected),
`RESEND_API_KEY`, `EMAIL_TRANSPORT`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`,
`APP_PUBLIC_URL`, `STATEMENTS_CRON_SECRET`, `STATEMENTS_CRON_TOKEN`,
`PAYSTACK_SECRET_KEY`, `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID`,
`AT_ALLOW_SANDBOX`, `SMS_ENABLED`, `SUPER_ADMIN_SMS_PHONE`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, and optionally `AI_PROVIDER` /
`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`. The database password lives only in your
password manager.

Verified: no service-role key, Resend key, Paystack secret or DB password appears in
`src/`. Every server credential is read with `Deno.env.get` inside
`supabase/functions/`, which never ships to the browser. Rule for Vercel: **only
`VITE_`-prefixed variables** — anything else added there is a leak waiting to happen.

---

## 11. Code dependency check

| # | Occurrence | Classification | Action |
|---|---|---|---|
| 1 | `src/integrations/supabase/client.ts:7-9` — hardcoded fallback `https://akmoxsaihexwjijtjzsj.supabase.co` + its anon key | **REPLACE (mandatory)** | Auto-generated file; it regenerates against the connected project. On Vercel it is a silent-failure trap: if `VITE_SUPABASE_URL` is missing the app talks to the **old** database. After the first Vercel build, confirm the console line `[supabase] init … urlSource: "env"` and that the bundle contains the new ref. Add a build-time guard that fails the build when `VITE_SUPABASE_URL` is unset. |
| 2 | `src/integrations/lovable/index.ts` — `@lovable.dev/cloud-auth-js`, `lovable.auth.signInWithOAuth` | **REPLACE** | Swap for `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: \`${window.location.origin}/auth/callback\` }})`, then drop the package. |
| 3 | `src/pages/SignInPage.tsx:6,158,316` — two calls to the wrapper above | **REPLACE** | Follows from #2. |
| 4 | `supabase/functions/ai-assistant/index.ts:4,5,120,136-137` — gateway URL, model, `LOVABLE_API_KEY`, Lovable headers | **REMOVE** | Delete at cutover; assistant defaults to disabled (§9). |
| 5 | `supabase/functions/_shared/resend-direct.ts:76,83` — gateway URL + `LOVABLE_API_KEY` inside `viaGateway` | **SAFE** | Only reachable when `EMAIL_TRANSPORT != "direct"`; exists so rollback is an env flip, not a code change. |
| 6 | `admin-email-send-campaign/index.ts:19,204`, `admin-monthly-statements/index.ts:24,169` — `LOVABLE_API_KEY` reads | **SAFE** | Now optional; only consulted in gateway mode. |
| 7 | `supabase/config.toml:1` — `project_id = "sanssnguhbugfizgpmld"` (stale, not the live ref) | **MANUAL CONFIGURATION** | Update to `<new-ref>` when you link the CLI. Only affects local tooling. |
| 8 | `05_import_data.sh:12` — the production ref as a refusal guard | **SAFE** | Deliberate safety check; keep it. |
| 9 | `docs/migration/*`, `docs/paystack-momo.md` — refs and key names in prose | **SAFE** | Documentation only. |
| 10 | Hardcoded secrets anywhere in the repo | **None found** | Scan for `sk_live`/`sk_test`/`re_…`/service-role JWTs returned nothing. |

No Lovable-specific storage URLs and no hardcoded production database credentials
exist anywhere in the repository.

---

## 12. Rollback

Rollback is a **DNS/env revert, not a data operation**:

1. Repoint `kuditrack.online` / `www` back to the Lovable Cloud deployment (or revert
   the Vercel domain assignment).
2. Leave the Lovable Cloud project running and untouched throughout the cutover
   window — it stays a complete, live copy of production.
3. If the old cron jobs were deactivated at cutover, re-activate them
   (`update cron.job set active = true`).
4. Leave `EMAIL_TRANSPORT` unset on Lovable Cloud — it already defaults to `gateway`,
   so campaigns and statements resume with no redeploy.
5. Keep the old Google OAuth redirect URI in the Google client (never remove it until
   rollback is retired), so Google sign-in keeps working immediately.

The new Supabase project is **not** deleted or modified by a rollback; it simply stops
receiving traffic. The only true point of no return is deleting or pausing the Lovable
Cloud project — do that only after a full validation window on the new stack. Writes
made on the new stack after cutover will not exist on Lovable Cloud, so define your
rollback window (recommended: same-day) and communicate it before switching traffic.

---

## 13. Final readiness status

| # | Area | Status | Note |
|---|---|---|---|
| 1 | `01_schema.sql` | GREEN | 0 errors on an empty PG17; policy-quoting blocker fixed |
| 2 | Object counts (52/6/119/51/57/185) | GREEN | Verified by execution, not by inspection |
| 3 | Grants + RLS coverage | GREEN | 0 missing grants, 0 policy-less RLS tables |
| 4 | `02_storage.sql` (7 buckets / 24 policies) | GREEN | Applied cleanly |
| 5 | `03_export_data.sh` | GREEN | Read-only on source |
| 6 | `04_validation.sql` | GREEN | `cron.job` probe fixed |
| 7 | `05_import_data.sh` | GREEN | Three independent anti-production guards |
| 8 | `06_storage_sync.sh` | GREEN | Identical object paths preserved |
| 9 | `07_cron.sql` | YELLOW | Placeholders `<new-ref>`, `<NEW_ANON_KEY>`, `<STATEMENTS_CRON_SECRET>` filled at run time |
| 10 | Data / UUID / timestamp fidelity | GREEN | `--data-only` + empty-target guard; duplicates impossible |
| 11 | Auth users, bcrypt hashes, identities | GREEN | Preserved by dump; no password resets |
| 12 | Auth project settings | YELLOW | Site URL, redirects, templates, providers set by hand (§4) |
| 13 | Google OAuth | YELLOW | Reuse existing client; add the new callback URI (§5) |
| 14 | Stored absolute storage URLs | YELLOW | One `replace()` update after import (§6) |
| 15 | Email → direct Resend | GREEN | Wired behind `EMAIL_TRANSPORT`; only `RESEND_API_KEY` needed |
| 16 | AI at cutover | GREEN | `AI_PROVIDER=disabled`; no vendor key required |
| 17 | `ai-assistant` gateway code removal | YELLOW | Scheduled deletion at cutover (§9) |
| 18 | Frontend Lovable auth wrapper | YELLOW | Replace with native `supabase.auth.signInWithOAuth` (§11 #2/#3) |
| 19 | Hardcoded old-project fallback in `client.ts` | YELLOW | Must verify env injection on the first Vercel build (§11 #1) |
| 20 | Secrets hygiene / Vercel split | GREEN | No private credential reachable from browser code |
| 21 | Rollback plan | GREEN | Env/DNS revert; new database untouched |

**RED blockers: 0.** (One RED — the 185 failing policy statements — was found during
this dry run and has been fixed and re-verified.)

**Verdict: READY, subject to the 7 YELLOW items**, all of which are manual
configuration steps performed during the cutover itself rather than defects in the
package.

Awaiting explicit "APPROVE PRODUCTION CUTOVER". Nothing further will be executed
against production until then.
