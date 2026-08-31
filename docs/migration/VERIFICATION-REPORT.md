# KudiTrack — Migration Package Verification Pass (READ-ONLY)

Date: 31 Aug 2026. **Nothing in production was changed.** Only catalogue `SELECT`s were run. No DDL, DML, auth, storage, secret, env-var or Lovable Cloud connection change. The only files written are migration artifacts in `supabase/migration-package/` and this report.

Three real defects were found in the package and fixed **in the artifacts only** (details in §10).

---

## 1. Authentication

**How `auth.users` / `auth.identities` migrate.** `03_export_data.sh` runs `pg_dump --data-only --no-owner --no-privileges -t auth.users -t auth.identities -t auth.mfa_factors`. `05_import_data.sh` loads that file into the target *before* public data, so every `user_id` FK resolves. This is a row-for-row copy — no Admin API, no re-creation.

- **UUIDs:** preserved exactly. `id` is dumped as a literal value; nothing regenerates it. Verified there are no sequences/identity columns anywhere, so no ID remapping can occur. New check `md5.auth_user_ids` in `04_validation.sql` proves source and target hold the identical UUID set.
- **Passwords:** `auth.users.encrypted_password` holds bcrypt hashes and is copied verbatim → **no password resets needed**. Live counts: **36 users, 41 identities, 24 users with a password hash**. Check `count.auth_users_with_password` confirms this post-import.
- **Google identities:** 18 rows with `provider='google'`. They carry `user_id` + `provider_id` (the Google `sub`). Because both are copied unchanged, existing Google users stay bound to the same account — **provided the new project uses a Google OAuth client that issues the same `sub`**. New check `md5.identities` verifies this exactly.

**Duplicate-user risk when swapping Lovable auth → native Supabase OAuth.** Two ways duplicates appear, both avoidable:

1. **Different Google OAuth client with a different `sub` space.** Google's `sub` is stable per Google account *per client project*, not per OAuth client ID. Reusing an OAuth client from the **same Google Cloud project** keeps `sub` identical. Creating the client in a **new Google Cloud project** yields a new `sub` for every user → each Google login creates a brand-new `auth.users` row while the old profile is orphaned. **This is the single largest auth risk.**
2. **Email-vs-Google collision.** If a user signed up with email/password and also with Google, disabling "confirm email"/identity-linking settings can split them. Keep `Enable manual linking` off and email confirmation settings identical to today.

Mitigation: before cutover, sign in with one real Google account on the new project and confirm `select provider_id from auth.identities where provider='google'` matches the source value for that user, and that `auth.users` count did not increase.

**Required Google OAuth configuration on the new project**

| Setting | Value |
|---|---|
| Google Cloud project | **Same project as today** (reuse or add a client inside it) |
| OAuth client type | Web application |
| Authorized JavaScript origins | `https://kuditrack.online`, `https://www.kuditrack.online`, `http://localhost:8080` |
| Authorized redirect URI | `https://<new-ref>.supabase.co/auth/v1/callback` |
| Supabase → Auth → Providers → Google | Enabled; Client ID + Client Secret from above |
| Supabase → Auth → URL Configuration → Site URL | `https://kuditrack.online` |
| Redirect allow-list | `https://kuditrack.online/**`, `https://www.kuditrack.online/**`, `https://*.vercel.app/**`, `http://localhost:8080/**`, plus `/auth/callback`, `/invite/*`, `/reset-password` |
| Scopes | default `email profile openid` (what the app uses today) |
| Skip nonce check | leave default |

Code side (not applied yet): `src/integrations/lovable/index.ts` + `src/pages/SignInPage.tsx` swap to `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.location.origin + '/auth/callback' }})`, then drop `@lovable.dev/cloud-auth-js` from `package.json`.

---

## 2. Database — object-by-object verification of `01_schema.sql`

Counted in the file, then compared against a live read-only catalogue query:

| Object | Live production | In `01_schema.sql` | Verdict |
|---|---:|---:|---|
| Tables | 52 | 52 `create table` | ✅ |
| Enums | 6 | 6 `create type` | ✅ |
| Indexes | 119 | 50 explicit `CREATE INDEX` + 52 PK + 18 UNIQUE constraints = 120 index-creating statements (one unique constraint shares an index name with a declared unique index) | ✅ — constraint-backed indexes are created implicitly, so all 119 are reproduced |
| Functions | 51 | 51 `create or replace function`, `security definer` and `set search_path` preserved | ✅ |
| Triggers | 57 | 57 `CREATE TRIGGER` | ✅ |
| RLS policies (public) | 185 | 185 `create policy`; 52 `enable row level security` | ✅ |
| Primary keys | 52 | 52 | ✅ |
| Foreign keys | 25 | 25 | ✅ |
| Unique constraints | 18 | 18 | ✅ |
| Check constraints | 9 | 9 | ✅ |
| Realtime publication tables | 16 | 16 | ✅ |
| **Table grants** | anon/authenticated/service_role on all 52 tables | **0 — section was empty** | ❌ → **fixed**, see §10 |

- **UUID preservation:** all PKs are `uuid default gen_random_uuid()`. `pg_dump --data-only` emits explicit `id` values via `COPY`, so defaults never fire. Nothing in the pipeline rewrites a UUID.
- **Sequences / auto-increment:** live check returned **0 sequences and 0 identity/`nextval` columns**. No "sequence out of sync" risk exists.
- **Required creation order** (already the order in the package): extensions → enums → tables → constraints (FKs after all tables) → indexes → functions (policies and triggers call `has_role`, `is_business_member*`, `offline_can_write`) → triggers → **grants** → `enable row level security` → policies → realtime publication. Data order: `auth.users`/`auth.identities` **before** any `public` data. Storage: `02_storage.sql` before object upload; `07_cron.sql` **after** edge functions are deployed.

---

## 3. Data export / import

**`03_export_data.sh` is read-only.** Every statement is `pg_dump` or `psql -f 04_validation.sql`; `04_validation.sql` is pure `SELECT`. No `INSERT`/`UPDATE`/`DELETE`/DDL anywhere, and `pg_dump` takes only `ACCESS SHARE` locks.

**Import cannot touch production — now enforced.** Previously the only guard was "target must not already contain `public.profiles`", which would *not* have stopped a mistyped `DST_DB_URL` pointing at a fresh project, and would have aborted (harmlessly) on production. Added two hard refusals at the top of `05_import_data.sh`: abort if `DST_DB_URL` contains the current project ref, and abort if `DST_DB_URL == SRC_DB_URL`.

**Triggers re-enabled after import — now proven.** `session_replication_role = replica` is a **session** setting; it dies with the psql session, so triggers were never persistently disabled. Added an explicit post-import assertion: `show session_replication_role` must be `origin`, and zero triggers may have `tgenabled <> 'O'`. The script now exits non-zero if either fails.

**Foreign keys intact.** Because triggers are suppressed but constraints are not, FKs are enforced during import — except the `--disable-triggers` dump also defers FK triggers. Added a post-import `validate constraint` sweep over every FK in `public`, plus 10 new orphan checks in `04_validation.sql` (expenses, other_income, savings, restocks, stock_movements, customers, sale_documents, audit_log, storage objects, identities) on top of the 7 that already existed. All must read 0.

**Timestamps / UUIDs / ownership unchanged.** `pg_dump --data-only` writes literal `timestamptz` values; the import runs no triggers, so no `updated_at` touch trigger can rewrite them. New fingerprints `md5.sale_created_at`, `md5.profile_ids`, `md5.product_ids`, `md5.sale_ids` catch any drift byte-for-byte.

**NOT included in the export (must be handled separately):**

- `auth.sessions` / `auth.refresh_tokens` → **every user is signed out at cutover and must log in again** (passwords still work).
- `auth.flow_state`, `auth.one_time_tokens` → in-flight password-reset / magic links break at cutover.
- Auth *configuration*: site URL, redirect allow-list, SMTP, email templates, JWT expiry, rate limits, provider secrets.
- Storage **file bytes** (only metadata is dumped; bytes move via `06_storage_sync.sh`).
- Edge function **secrets** — unreadable by design.
- `supabase_vault` secrets.
- `cron.job` rows (now covered by the new `07_cron.sql`).
- `pg_stat_statements` / analytics / logs history.
- Realtime and Postgres **role passwords**.

---

## 4. Storage

- **7 buckets** verified against live: `business-logos` (public), `avatars` (public), `platform-ads` (public), `expense-receipts` (private), `other-income-receipts` (private), `email-media` (private), `database_export_05_08_26` (private). All 7 are in `02_storage.sql` with the correct `public` flag. `file_size_limit` and `allowed_mime_types` are `null` on every bucket in production, so nothing extra to reproduce.
- **24 storage policies** — count matches live exactly. ❌ **Defect found:** all 24 were written with single-quoted policy names (`create policy 'x'`), which Postgres rejects. Fixed to double quotes (§10).
- **Identical object paths:** `06_storage_sync.sh` walks each bucket recursively and re-uploads to `{DST}/storage/v1/object/{bucket}/{same name}`. Paths, including folder prefixes, are byte-identical. New fingerprint `md5.storage_paths` verifies this after sync.
- **Database references stay valid:** private buckets store relative paths (`expenses.attachment_path`, `other_income.attachment_path`) → valid unchanged. Public buckets store **absolute URLs containing the old project ref** (`profiles.logo_url`, `profiles.avatar_url`, `products.image_url`, `platform_ads.image_url`, `marketing_reviews.avatar_url/media_url`, `email_media_library.url`, `email_campaigns.body_html`) → these **must** be rewritten on the target (runbook Phase 6). Without it, images 404.
- **Manual bucket config:** public/private flags are reproduced by `02_storage.sql`, but if you create buckets through the dashboard instead, set `business-logos`, `avatars`, `platform-ads` public and the other four private by hand.

---

## 5. Edge functions, environment and cron

Functions depending on env vars / external services:

- **Paystack:** `paystack-init`, `paystack-payment`, `paystack-verify`, `paystack-webhook`, `manage-subscription` → `PAYSTACK_SECRET_KEY`.
- **Email:** `admin-email-send-campaign`, `admin-monthly-statements`, `admin-email-audience-preview`, `email-track-open`, `email-track-click`, `email-unsubscribe`, `sync-email-verification` → `RESEND_API_KEY`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`/`APP_PUBLIC_URL`, `STATEMENTS_CRON_SECRET`/`STATEMENTS_CRON_TOKEN`, **and `LOVABLE_API_KEY`** (see §6).
- **SMS/OTP:** `send-order-sms`, `send-sale-thanks-sms`, `send-low-stock-alert`, `send-team-invite-sms`, `admin-send-sms`, `notify-admin-event`, `send-signup-otp`, `verify-signup-otp`, `phone-*-otp`, `password-reset-*-otp`, `resolve-phone-login` → `AT_API_KEY`, `AT_SENDER_ID`, `SMS_ENABLED`, `SUPER_ADMIN_SMS_PHONE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.
- **AI:** `ai-assistant` → `LOVABLE_API_KEY`.
- **No secrets:** `exchange-rates` (open.er-api.com), `submit-public-order`, `confirm-order-receipt`, `admin-delete-user`, `manage-business-user`, `claim-referral`, `referrals-schema-check` (these use the auto-injected `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` only).

**pg_cron — correction to the earlier report: there are TWO active jobs, not one.**

| Job | Schedule | What it does | Depends on |
|---|---|---|---|
| `kuditrack-email-scheduled-runner` | `* * * * *` (every minute) | `net.http_post` → `admin-email-send-campaign`; picks up campaigns whose `scheduled_at` has passed | `pg_net`, project anon key in the header, function deployed |
| `monthly-financial-statements` | `0 6 1 * *` (06:00 UTC, 1st of month) | `net.http_post` → `admin-monthly-statements`; generates and emails each business's PDF statement | `pg_net`, `x-cron-secret` header matching the `STATEMENTS_CRON_SECRET` function secret, Resend |

Both are now scripted in the new **`supabase/migration-package/07_cron.sql`** with placeholders for `<new-ref>`, the new anon key and the statements secret. Run it **after** deploying the edge functions. The existing secret value is stored in the source job definition; read it out yourself with the postgres role at cutover rather than copying it into git.

**Lovable-specific dependencies in functions:** `ai-assistant`, `admin-email-send-campaign` and `admin-monthly-statements` all call the Lovable gateway with `LOVABLE_API_KEY` — the two email functions route Resend through it (`${GATEWAY}/emails/batch` with `X-Connection-Api-Key: RESEND_API_KEY`) and both **hard-fail** if `LOVABLE_API_KEY` is absent.

---

## 6. Lovable AI / gateway dependency

| Where | What it does | Breaks after leaving Lovable Cloud |
|---|---|---|
| `supabase/functions/ai-assistant/index.ts` | LLM behind the KudiTrack AI Business Assistant (chat, voice-driven sales/expense entry, product matching) | The assistant returns errors; the offline parser in `src/lib/offline-assistant.ts` still handles simple commands, so the UI degrades rather than disappears |
| `supabase/functions/admin-email-send-campaign/index.ts` | Sends Resend batches **through the Lovable gateway** | All bulk email / newsletter sending stops |
| `supabase/functions/admin-monthly-statements/index.ts` | Same gateway path for statement emails | Monthly PDF statements stop being delivered |
| `src/integrations/lovable/index.ts`, `src/pages/SignInPage.tsx`, `package.json` | `@lovable.dev/cloud-auth-js` Google sign-in | Google sign-in stops |

**If you replace Lovable AI with Anthropic Claude (not done — awaiting your go-ahead):**
- `supabase/functions/ai-assistant/index.ts`: swap the endpoint to `https://api.anthropic.com/v1/messages`, headers to `x-api-key: ANTHROPIC_API_KEY` + `anthropic-version: 2023-06-01`, request body to Claude's `{ model, max_tokens, system, messages, tools }` shape (system prompt moves out of `messages`), response parsing from `choices[0].message` to `content[]` blocks, streaming from OpenAI SSE deltas to `content_block_delta` events, and tool-calling from `tool_calls` to Claude `tool_use`/`tool_result` blocks. Add secret `ANTHROPIC_API_KEY`.
- The two email functions are **not** an AI change: point `GATEWAY` at `https://api.resend.com`, use `Authorization: Bearer RESEND_API_KEY`, and delete the `X-Connection-Api-Key` header and the `LOVABLE_API_KEY` guard.

---

## 7. Third-party services

| Service | Purpose | Current integration | Secret / env var | Stored where | Manual? |
|---|---|---|---|---|---|
| Paystack | Subscription payments, MoMo | 5 edge functions + webhook | `PAYSTACK_SECRET_KEY` | Supabase function secrets | Yes — key + webhook URL re-point |
| Resend | Campaigns, statements, transactional | Edge functions (today via Lovable gateway) | `RESEND_API_KEY`, `SENDER_DOMAIN=mail.kuditrack.online` | Supabase function secrets | Yes — key; DNS/DKIM unchanged |
| Africa's Talking / Arkesel SMS | Order, sale, low-stock, invite, OTP SMS | `_shared/at-sms.ts` | `AT_API_KEY`, `AT_SENDER_ID`, `SMS_ENABLED`, `SUPER_ADMIN_SMS_PHONE` | Supabase function secrets | Yes |
| Twilio | WhatsApp OTP | `phone-*-otp` functions | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` | Supabase function secrets | Yes |
| Google OAuth | Social sign-in | Lovable auth SDK today | Client ID + Secret | Supabase Auth provider settings | Yes |
| Lovable AI Gateway | AI assistant + email transport | `LOVABLE_API_KEY` | `LOVABLE_API_KEY` (or `ANTHROPIC_API_KEY` after swap) | Supabase function secrets | Yes — decision required |
| open.er-api.com | FX rates | `exchange-rates` | none | — | No |
| Statements cron | Auth for the scheduled call | `x-cron-secret` | `STATEMENTS_CRON_SECRET`, `STATEMENTS_CRON_TOKEN` | Supabase function secrets **and** the cron job body | Yes |
| Supabase (new project) | DB, auth, storage, functions | supabase-js | `SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` | auto-injected into functions | No |
| Vercel | Frontend hosting | — | the 3 `VITE_` vars | Vercel env | Yes |

---

## 8. Vercel environment variables

**Public frontend (safe in the browser bundle) — this is the complete list:**

```
VITE_SUPABASE_URL=https://<new-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<new anon/publishable key>
VITE_SUPABASE_PROJECT_ID=<new-ref>
```

**Server-side / private — set on Supabase Edge Function secrets, NOT on Vercel:** `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`, `APP_PUBLIC_URL`, `STATEMENTS_CRON_SECRET`, `STATEMENTS_CRON_TOKEN`, `AT_API_KEY`, `AT_SENDER_ID`, `SMS_ENABLED`, `SUPER_ADMIN_SMS_PHONE`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `LOVABLE_API_KEY` (or `ANTHROPIC_API_KEY`). Auto-injected, never set by hand: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**No service-role key or private secret reaches the browser.** Vite only inlines `VITE_`-prefixed variables, and all three are public by design. One caveat: `src/integrations/supabase/client.server.ts` reads `SUPABASE_SERVICE_ROLE_KEY`. It is not imported by any client route today, but it sits inside `src/`, so a future import would bundle it — **delete this file as part of the Phase 8 code change**.

---

## 9. `04_validation.sql` coverage

Already covered: per-table row counts (all 52, so users/businesses/products/customers/sales/sale items/expenses/stock movements/audit logs are included), auth user + identity + password-hash counts, storage buckets/objects/per-bucket counts, financial sums (sales, paid, line totals, expenses, other income, savings, restocks, orders, subscription payments), inventory balances (`products.stock`, `stock_movements.change`), 7 orphan checks, RLS/policy/function/trigger/index/realtime counts.

**Added in this pass** (still 100% read-only — nothing executed against production):
- Table/enum inventory + per-enum label counts.
- PK / FK / unique / check constraint counts; sequence and identity-column counts (must be 0); security-definer function count.
- **Grant counts per role** — the check that would have caught the missing-GRANT defect.
- Extension presence and `cron.job` inventory with schedules.
- 10 further orphan checks (expenses, other_income, savings, restocks, stock_movements, customers, sale_documents, audit_log, storage objects, identities).
- Byte-level fingerprints: `md5` of auth user IDs, identities (provider+provider_id+user_id), profile/product/sale IDs, sale `created_at`, storage paths, bucket config — these prove UUIDs, ownership and timestamps are unchanged.
- RLS behaviour: tables **without** RLS and tables **without any policy** (both must be 0), plus realtime table count.

---

## 10. Defects found and fixed in the artifacts

1. **RED (was a guaranteed post-migration outage): `01_schema.sql` had an empty GRANTS section.** Production grants `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` to `anon`, `authenticated` and `service_role` on all 52 tables; without them PostgREST returns `permission denied` for every request even with correct RLS. Generated the full grant block (including the three tables with intentionally narrowed grants: `email_marketing_unsubscribes` anon has no INSERT, `referral_codes` and `signup_otps` anon has no SELECT, `signup_otps` authenticated is SELECT-only) plus `grant usage on schema public` and `grant execute on all functions`.
2. **RED: `02_storage.sql` used single quotes for all 24 policy names** — Postgres would abort on the first `create policy`. Rewritten with double-quoted identifiers.
3. **YELLOW: `05_import_data.sh` had no protection against being pointed at production**, no proof that triggers were live afterwards, and no FK validation sweep. All three added.
4. **YELLOW: only one cron job was documented; two exist.** New `07_cron.sql` scripts both.

---

## 11. Final risk assessment

**GREEN — safe / ready**
- Schema completeness: 52 tables, 6 enums, 119 indexes, 51 functions, 57 triggers, 185 policies, 52 PK / 25 FK / 18 unique / 9 check — all verified against live catalogues.
- No sequences, no identity columns → zero ID-drift risk.
- UUID, timestamp and ownership preservation (fingerprints now enforce it).
- Password hashes migrate as-is; no user resets.
- Export path is provably read-only.
- Trigger suppression is session-scoped and now asserted back to `origin`.
- Storage object paths identical; private-bucket references stay valid.
- Import guards against touching the source project.
- `04_validation.sql` now covers every category you listed.

**YELLOW — requires configuration or verification**
- Google OAuth: must reuse the **same Google Cloud project** and be verified with a live sign-in before cutover.
- Public-bucket absolute URLs need the one-time host rewrite (7 columns) or images 404.
- All third-party secrets must be re-collected from their own dashboards.
- Both cron jobs must be recreated (`07_cron.sql`) after functions deploy; the statements cron secret must match the function secret.
- Paystack and Resend webhook URLs must be re-pointed at cutover.
- All users are signed out at cutover (sessions are not migrated); in-flight password-reset links break.
- Auth settings not in the database (site URL, redirect allow-list, SMTP, templates, JWT expiry, rate limits) must be reproduced by hand.
- Delete `src/integrations/supabase/client.server.ts` and remove the hardcoded old URL/key fallback in `src/integrations/supabase/client.ts` in the same commit as the env swap.
- `pg_cron` / `pg_net` must be enabled on the new project's plan before `07_cron.sql`.
- Storage sync script does not send an upsert header — re-running it over existing objects will error; run it once into an empty target.
- `supabase_vault` contents are unreadable and unverified.

**RED — blockers that must be resolved before migration**
1. **Lovable AI Gateway (`LOVABLE_API_KEY`) is on the critical path for bulk email and monthly statements, not just the AI assistant.** Until those two functions are repointed at Resend directly (or the key keeps working), campaign sending and statement delivery stop the moment you leave Lovable Cloud. Decision required.
2. **`ai-assistant` has no external equivalent configured** — choose Claude (or another provider) and add the secret before cutover, or ship with the assistant degraded to the offline parser.
3. *(Resolved in this pass, previously blocking:)* missing GRANTs and invalid storage-policy syntax — both would have failed the migration outright.

---

**Nothing has been migrated. Production is unchanged, Lovable Cloud is still connected, no env var, secret, user, data row, storage object or database object was modified. Waiting for your explicit approval before any migration step.**
