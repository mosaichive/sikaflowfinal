# KudiTrack — Lovable Dependency Removal + Final Local Validation

Date: 31 Aug 2026 · Status: **PREPARATION COMPLETE — production untouched, no cutover performed**

No Lovable Cloud object, secret, env var, user, function, cron job or DNS record was changed.
All validation below ran against throwaway artifacts: a local PostgreSQL 17.9 instance and
local Vite builds written to `/tmp` (deleted afterwards).

---

## 1. Lovable database fallback — REMOVED

`src/integrations/supabase/client.ts` previously carried `DEFAULT_SUPABASE_URL`
(`https://akmoxsaihexwjijtjzsj.supabase.co`) and the production anon key as literals, used
whenever env injection was absent. Any Vercel build with a missing/typo'd env var would have
silently written to the old database.

Now:
- No URL, key or project ref in source. Config comes only from `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy alias `VITE_SUPABASE_ANON_KEY` still accepted).
- Missing either value throws at module load:
  `Supabase is not configured: missing <names>. Set these environment variables in your
  deployment (and local .env) before building the app.`
- `src/integrations/supabase/client.server.ts` (a **service-role** client living inside `src/`,
  imported by nothing) was **deleted** — it can no longer be pulled into a browser bundle.

### Repository-wide occurrence scan

| Location | Value | Disposition |
|---|---|---|
| `src/integrations/supabase/client.ts` | project URL + anon key literals | **removed** |
| `src/integrations/supabase/client.server.ts` | `SUPABASE_SERVICE_ROLE_KEY` usage | **file deleted (unused)** |
| `src/integrations/lovable/index.ts` | `@lovable.dev/cloud-auth-js` broker | **made switchable, stubbed out of prod builds** |
| `package.json` | `@lovable.dev/cloud-auth-js` dependency | retained for the current Lovable build only; excluded from the cutover bundle by alias |
| `docs/**`, `supabase/migration-package/**` | project ref appears in prose/instructions | documentation only — no runtime effect |
| `supabase/functions/**` | `LOVABLE_API_KEY` in `ai-assistant`, `admin-email-send-campaign`, `admin-monthly-statements` | gateway path only; both email functions already switch to direct Resend via `EMAIL_TRANSPORT=direct`; `ai-assistant` ships disabled |

`rg` over `src/`, `index.html`, `vite.config.ts`, `vercel.json`, `public/_redirects` returns
**zero** occurrences of the old project ref outside documentation.

## 2. Lovable auth dependency — REMOVED FROM THE PRODUCTION PATH

`src/integrations/lovable/index.ts` keeps its public shape (`lovable.auth.signInWithOAuth`), so
`SignInPage.tsx` and `InviteAcceptPage.tsx` need no edit at cutover. Internally it now selects a
provider:

- `VITE_AUTH_PROVIDER=supabase` → native `supabase.auth.signInWithOAuth({ provider, options:
  { redirectTo, queryParams } })`. **This is the cutover setting for Vercel.**
- `VITE_AUTH_PROVIDER=lovable` (or unset on a `*.lovable.app` host) → the legacy broker,
  unchanged, so current production behaviour is byte-for-byte identical.

`vite.config.ts` additionally aliases `@lovable.dev/cloud-auth-js` to an inert stub whenever
`VITE_AUTH_PROVIDER=supabase`, so the broker is **physically absent** from the production bundle
— verified below, not merely unreferenced.

## 3. Verification results

Build A — cutover settings (`VITE_AUTH_PROVIDER=supabase`, dummy external URL/key):

| Check | Result |
|---|---|
| Old project ref `akmoxsaihexwjijtjzsj` in bundle | **0 files** |
| Lovable auth broker (`cloud-auth-js`, `oauth.lovable.app`) in bundle | **0 files** |
| `service_role` in bundle | **0 files** |
| Configured external URL present | 2 chunks (expected) |
| TypeScript (`tsgo`, app project) | clean |

Build B — env vars blank: build succeeds, bundle contains the
`Supabase is not configured` guard, and the app fails loudly at startup instead of connecting
anywhere.

Migration package re-validated on a fresh local PostgreSQL 17.9:

| Artifact | Result |
|---|---|
| `01_schema.sql` | 52 tables · 6 enums · 119 indexes · 97 functions · 57 triggers · **185 policies** · 52 RLS-enabled tables · only 2 errors, both `pg_cron`/`pg_net` "extension not available" (absent locally, present on Supabase) |
| `02_storage.sql` | 7 buckets · **24 storage policies**; a second run errors only with "policy already exists" (idempotency note, not a defect) |
| `04_validation.sql` | parses and runs; the only errors reference `auth.identities`/`encrypted_password`, which exist on real Supabase but not in the local auth stub |
| `resend-direct.ts` | intact — `api.resend.com` direct transport, `EMAIL_TRANSPORT` defaults to `gateway`, flips to `direct` with no code change |
| `ai-provider.ts` | `AI_PROVIDER` defaults to `disabled`; no vendor required |
| Anthropic / Claude | **0 code references** (one historical line in `VERIFICATION-REPORT.md` recording the decision) |
| Lovable AI Gateway | not required by any cutover path |

## 4. Remaining YELLOW items for cutover

1. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` and
   `VITE_AUTH_PROVIDER=supabase` in Vercel (all three environments).
2. Configure Google in the new project's Auth settings and add every callback URL
   (`https://kuditrack.online`, `https://www.kuditrack.online`, `/invite/:token`, Vercel preview
   hosts) — Branch A (reuse the existing Google Cloud client) preserves all 18 `sub` values.
3. Set Auth Site URL + redirect allowlist; keep email confirmation and signup settings as today.
4. Delete the Lovable gateway code inside `ai-assistant/index.ts` and switch it to
   `runAssistantTurn()` with `AI_PROVIDER=disabled`.
5. Set edge-function secrets: `RESEND_API_KEY`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`,
   `EMAIL_TRANSPORT=direct`, `AI_PROVIDER=disabled`, `PAYSTACK_*`, `TWILIO_*`,
   `STATEMENTS_CRON_SECRET`, `EMAIL_CRON_SECRET`. Do **not** carry `LOVABLE_API_KEY`.
6. Enable `pg_cron` + `pg_net`, then run `07_cron.sql` with the new project ref and secrets.
7. Rewrite absolute storage URLs in the database (`business_logo_url`, `avatar_url`, product
   images, email media) to the new project ref.
8. Re-verify `mail.kuditrack.online` in Resend on the new account (DKIM/SPF/DMARC/BIMI) and
   re-point the Paystack webhook.

Nothing RED remains. Awaiting **"APPROVE PRODUCTION CUTOVER"**.
