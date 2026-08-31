# KudiTrack — Migration Readiness Report

Status: **PREPARATION COMPLETE — AWAITING "APPROVE PRODUCTION CUTOVER"**
Date: 31 Aug 2026
Production (Lovable Cloud) is **untouched and fully operational**. No schema, auth, storage,
secret, domain, or traffic change was made. Everything below is documentation plus inert code
that is not imported by any deployed function.

---

## 0. What changed in this pass (repo only)

| File | Purpose | Wired into production? |
|---|---|---|
| `supabase/functions/_shared/resend-direct.ts` | Direct `api.resend.com` transport (single + batch), plus `sendEmailAuto`/`sendBatchAuto` that switch on `EMAIL_TRANSPORT` | **No** — nothing imports it yet |
| `supabase/functions/_shared/ai-provider.ts` | Vendor-neutral assistant turn: `disabled` (default after cutover) or any OpenAI-compatible endpoint, switched by `AI_PROVIDER`. **No Lovable AI Gateway, no Anthropic.** | **No** — nothing imports it yet |
| `supabase/migration-package/01–07` | Corrected schema, storage, export, import, validation, cron artifacts (from the verification pass) | Target project only |
| `docs/migration/MIGRATION-READINESS.md` | This document | — |

---

## 1. Lovable Gateway dependencies (the RED item)

Three functions reference `LOVABLE_API_KEY`. Nothing else in the codebase does.

### 1.1 `ai-assistant`
- **What the gateway does today:** proxies to `https://ai.gateway.lovable.dev/v1/responses`
  (OpenAI Responses API) with `stream: true`, low-effort reasoning, and strict
  `json_schema` structured output (`assistant_turn` → `{ reply, action }`).
- **External service behind it:** OpenAI (billed as Lovable AI credits).
- **API calls:** one `POST /v1/responses` per user turn; SSE stream accumulated server-side.
- **Secrets today:** `LOVABLE_API_KEY`.
- **Replacement (prepared, not switched):** `_shared/ai-provider.ts` →
  `POST https://api.anthropic.com/v1/messages` with `anthropic-version: 2023-06-01`,
  a single forced tool (`emit_turn`) whose `input_schema` is the *same* `ACTION_SCHEMA`,
  and `tool_choice: {type:"tool", name:"emit_turn"}`. The `{ reply, action }` contract,
  offline fallback parser, and product-matching logic are unchanged.
- **Secrets after cutover:** `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`
  (default `claude-sonnet-4-5`), `AI_PROVIDER=anthropic`.
- **Cutover edit (one function, ~15 lines):** in `ai-assistant/index.ts` replace the inline
  `fetch(GATEWAY, …)` block with
  `await runAssistantTurn({ systemPrompt, messages: trimmed, schema: ACTION_SCHEMA, lovableModel: MODEL, readOutputText })`
  and return `result.reply` / `result.action`.

### 1.2 `admin-email-send-campaign`
- **What the gateway does today:** connector proxy
  `https://connector-gateway.lovable.dev/resend/emails/batch` — it only injects auth and
  forwards to Resend; the app already supplies `RESEND_API_KEY` in `X-Connection-Api-Key`.
- **External service:** Resend.
- **API calls:** `POST /emails/batch`, 90 messages per batch, 1100 ms between batches.
- **Secrets today:** `LOVABLE_API_KEY` + `RESEND_API_KEY`.
- **Replacement:** `sendBatchDirect()` → `POST https://api.resend.com/emails/batch` with
  `Authorization: Bearer RESEND_API_KEY`. Identical request body and return shape.
- **Secrets after cutover:** `RESEND_API_KEY`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`,
  `EMAIL_TRANSPORT=direct`.

### 1.3 `admin-monthly-statements`
- Same gateway, `POST /resend/emails` (single send, PDF attachment via `jspdf`).
- **Replacement:** `sendEmailDirect()` → `POST https://api.resend.com/emails`.
- **Secrets after cutover:** `RESEND_API_KEY`, `STATEMENTS_CRON_SECRET`, `PUBLIC_APP_URL`,
  `EMAIL_TRANSPORT=direct`.

### 1.4 Functionality that stops working the moment Lovable Cloud is left, if not swapped
1. AI Business Assistant (all natural-language sale/expense/stock capture) — hard fail 500.
2. Bulk email campaigns and test sends — hard fail.
3. Automated monthly financial statement emails (cron) — hard fail, silent until the log is read.

Everything else (Paystack, Twilio/SMS, exchange rates, OTP flows, backups, tracking pixels)
uses its own secret and calls the vendor directly — no Lovable dependency.

---

## 2. Google authentication

### 2.1 Current configuration
- The app does **not** use `supabase.auth.signInWithOAuth('google')` for sign-in. It calls
  `lovable.auth.signInWithOAuth('google', { redirect_uri })` from
  `src/integrations/lovable/index.ts` (package `@lovable.dev/cloud-auth-js`), which brokers
  Google through **Lovable's own Google OAuth client**. Only `InviteAcceptPage.tsx` uses the
  native Supabase call.
- Redirect URIs in use: `window.location.origin` (+ `/invite/:token`) for
  `https://kuditrack.online`, `https://www.kuditrack.online`,
  `https://sikaflowfinal.lovable.app`, and the preview host.
- Production identity counts today: **36 users**, **23 email identities**, **18 google identities**.

### 2.2 How Google identities are bound to users
`auth.identities` rows carry `user_id`, `provider = 'google'`, and
`provider_id` = the Google **`sub`** claim (also inside `identity_data->>'sub'`). Supabase
matches a returning Google login by `(provider, provider_id)` first, so the association
survives the move **as long as the `sub` values stay the same**. `sub` is stable per
(Google account × OAuth *client project*). It changes only if a **different Google Cloud
project** issues the token.

### 2.3 Safe procedure (no duplicate users)
1. `pg_dump` of `auth.users` **and** `auth.identities` together — never one without the other.
   UUIDs, `encrypted_password` (bcrypt), `email_confirmed_at`, `raw_user_meta_data`,
   `created_at`, and `provider_id` all import verbatim. **No password resets required.**
2. Import with `--disable-triggers` into an empty target `auth` schema, `auth.users` before
   `auth.identities` (FK order), before any `public` data (all `public` FKs point at `auth.users`).
3. In the target Supabase project enable the Google provider using a client from the **same
   Google Cloud project** Lovable used, or the customer's own project — see the branch below.
4. Verify before opening traffic:
   ```sql
   select count(*) from auth.users;                                   -- expect 36
   select provider, count(*) from auth.identities group by 1;         -- expect email 23, google 18
   select count(*) from auth.identities i
     left join auth.users u on u.id = i.user_id where u.id is null;   -- expect 0
   ```
5. Smoke-test one Google account on a staging URL and confirm `auth.users` count stays 36.

**Branch A — reuse the same Google Cloud project/client:** `sub` is unchanged, every existing
google identity keeps working, zero duplicates. This is the only zero-risk path and requires
Lovable to hand over (or the customer to already own) that client.

**Branch B — new Google Cloud project/client:** `sub` changes, so first Google login creates a
**new** `auth.users` row → duplicate accounts. Mitigation, applied *before* opening Google
sign-in on the new stack:
- Enable "Confirm email"/account linking so Supabase links a Google login to an existing user
  with the same verified email instead of creating one, **and**
- Pre-emptively delete the stale `google` rows from `auth.identities` (the user rows stay), so
  the first login links a fresh identity to the existing UUID by email, **or**
- Rewrite `provider_id`/`identity_data->>'sub'` per user once the new `sub` values are known.
- Users with a Google-only account and an unverified email must be handled manually.

Recommendation: pursue Branch A; treat Branch B as a fallback that needs its own dry run.
Do **not** create the new client until cutover is approved (per your instruction).

---

## 3. Database

- **Source inventory:** 52 public tables, 6 enums, 119 indexes, 51 functions, 57 triggers,
  185 RLS policies, 0 sequences, 7 extensions (`pgcrypto`, `uuid-ossp`, `pg_cron`, `pg_net`,
  `pg_stat_statements`, `pg_graphql`, `supabase_vault`).
- **Target requirements:** Postgres 15+ Supabase project, same extensions enabled,
  `pg_cron` + `pg_net` enabled before `07_cron.sql`, compute ≥ Small for the import window.
- **Artifacts:** `01_schema.sql` (types → tables → constraints → indexes → functions →
  triggers → **GRANTs** → RLS policies), `02_storage.sql`, `03_export_data.sh` (read-only,
  `pg_dump --data-only`), `05_import_data.sh` (refuses the source ref, `--disable-triggers`,
  asserts `tgenabled='O'` afterwards, full FK re-validation sweep), `04_validation.sql`,
  `07_cron.sql`.
- **Order of operations:** extensions → enums → tables → FKs → indexes → functions → triggers
  → grants → RLS → `auth.users` → `auth.identities` → `storage.buckets` → public data
  (parents first) → `storage.objects` → cron.
- **UUIDs/timestamps:** preserved exactly — the dump carries literal values and no column uses
  a sequence or `DEFAULT` on import (`--disable-triggers` also blocks `updated_at` triggers).
- **Not in the export:** Supabase project settings, Auth provider config, SMTP config, secrets,
  edge-function source, cron jobs, `storage.objects` **bytes** (mirrored by `06_storage_sync.sh`),
  `auth.audit_log_entries`, `auth.refresh_tokens` (all sessions end → users sign in again once).

## 4. Storage
7 buckets, 24 policies, byte-identical object paths via `06_storage_sync.sh`. Public/private
flags must be reproduced manually (`02_storage.sql` sets them). Absolute URLs stored in the DB
contain the old project ref and **must** be rewritten (Phase 6 SQL in the verification report):
`business_logo_url`, `avatar_url`, product images, email media library.

## 5. Cron
Two `pg_cron` jobs, recreated by `07_cron.sql`:
- email campaign runner → `admin-email-send-campaign` `{action:"run_scheduled"}`, every 5 min.
- monthly statements → `admin-monthly-statements`, 1st of month.
Both use `pg_net` + a shared secret header; update the URL and secret for the new project ref.

## 6. Environment variables

**Vercel — public (browser, `VITE_`):**
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (anon), `VITE_SUPABASE_PROJECT_ID`.
Nothing else. No service-role key, no Resend/Anthropic/Paystack/Twilio key is ever exposed —
they exist only as Supabase Edge Function secrets.

**Supabase Edge Function secrets (server-side only):**
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (auto),
`RESEND_API_KEY`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`, `EMAIL_TRANSPORT=direct`,
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_PROVIDER=anthropic`,
`PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (or the SMS provider in use),
`STATEMENTS_CRON_SECRET`, `EMAIL_CRON_SECRET`, `EXCHANGE_RATES_*` if set.
`LOVABLE_API_KEY` is **not** carried over.

## 7. Third-party services

| Service | Purpose | Current integration | Required secret | Stored | Manual step |
|---|---|---|---|---|---|
| Resend | Campaigns, statements, transactional | Lovable connector gateway | `RESEND_API_KEY` | Supabase secret | Re-verify `mail.kuditrack.online` DNS on the new account; switch to direct API |
| Anthropic | AI assistant (replacement) | none yet | `ANTHROPIC_API_KEY` | Supabase secret | Create key, set `AI_PROVIDER=anthropic` |
| Paystack | Subscriptions | direct API + webhook | `PAYSTACK_SECRET_KEY`, webhook secret | Supabase secret | Re-point webhook URL to new project ref |
| Twilio / SMS | Order + status SMS | direct API | `TWILIO_*` | Supabase secret | Copy credentials; sender ID unchanged |
| Google OAuth | Sign-in | Lovable-brokered | client id/secret | Supabase Auth config | See §2 |
| open.er-api.com | FX rates | public, keyless | — | — | none |

## 8. Validation checklist (`04_validation.sql`)
Row counts for users/identities/businesses/products/customers/sales/sale_items/expenses/
orders/stock_movements/subscriptions/campaigns; enum, index, function, trigger, policy, grant
and constraint counts; sequence count = 0; 10 orphan-FK checks; MD5 fingerprints over UUIDs,
timestamps and storage paths. Run on source (recorded), then on target — every number and
fingerprint must match exactly.

## 9. Rollback
Because nothing in Lovable Cloud is modified, rollback at any stage before DNS switch is:
delete/ignore the target project. After DNS switch: repoint `kuditrack.online` back to the
Lovable deployment, re-enable the paused cron jobs on Lovable, re-point the Paystack webhook.
Window for data written to the new stack: reconcile with `03_export_data.sh` run against the
new project and a delta import back. Keep the old backend live and untouched for ≥ 14 days.

## 10. Cutover sequence (execute only after "APPROVE PRODUCTION CUTOVER")
1. Freeze writes (maintenance banner) · 2. run `04_validation.sql` on source · 3. `03_export_data.sh`
· 4. apply `01_schema.sql` + `02_storage.sql` on target · 5. `05_import_data.sh` · 6. `06_storage_sync.sh`
· 7. URL-rewrite SQL · 8. set all secrets · 9. deploy 24 edge functions · 10. configure Google provider (§2)
· 11. `07_cron.sql` · 12. run `04_validation.sql` on target and diff · 13. deploy frontend to Vercel with
new `VITE_*` and swap `EMAIL_TRANSPORT`/`AI_PROVIDER` · 14. smoke tests (login, Google login, sale, order,
Paystack test charge, campaign test send, assistant turn) · 15. DNS switch · 16. 14-day dual-retention.

---

## 11. Final risk register

**RED (blockers, all now have prepared fixes — none applied to production)**
1. `LOVABLE_API_KEY` in `ai-assistant`, `admin-email-send-campaign`, `admin-monthly-statements`.
   *Fix prepared:* `_shared/resend-direct.ts`, `_shared/ai-provider.ts`. **Action needed:** obtain
   `ANTHROPIC_API_KEY`, then approve the three-file swap.
2. Google OAuth client ownership (§2). Unresolved until you confirm Branch A or B.
3. `@lovable.dev/cloud-auth-js` sign-in path must be rewritten to `supabase.auth.signInWithOAuth`
   before the frontend can run off Lovable. Code change is small but touches `SignInPage.tsx`
   and `src/integrations/lovable/index.ts`; not started, per your no-production-change rule.

**YELLOW (configuration)**
Secret collection · Resend domain re-verification + DKIM/SPF/DMARC/BIMI DNS · storage public-URL
rewrite · Paystack webhook re-point · cron URL/secret update · `pg_cron`/`pg_net` enablement ·
compute/disk sizing · Vercel domain + redirect-URI allowlist in Supabase Auth.

**GREEN (ready)**
Schema/enum/index/function/trigger/policy/grant artifacts · UUID and password-hash preservation ·
read-only export · import safety rails and FK re-validation · storage path fidelity · cron SQL ·
validation fingerprints · rollback plan · Paystack/Twilio/FX functions (no Lovable dependency).

---

**Stopping here. No production change will be made until you reply "APPROVE PRODUCTION CUTOVER".**
