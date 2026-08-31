# Final checklist — when is it safe to connect the STAGING KudiTrack app?

Work top to bottom. Do not point staging at the new project until every box in
sections A–C is ticked. Production traffic stays on Lovable Cloud throughout.

## A. Migration integrity (from `runs/<id>/VALIDATION-REPORT.md`)

- [ ] Section 1 of the report contains **zero** `FAIL` rows.
- [ ] Auth user count, UUID digest, identity count, provider_id digest and password-hash digest all PASS.
- [ ] Sales / sale-item / expense / other-income sums match to the cent.
- [ ] Storage object count and path digest match.
- [ ] Section 2 fingerprint diff is empty apart from `cron.jobs`.
- [ ] Section 3 integrity counters are all `0` (no orphans, no policy-less RLS table, no missing grant, no disabled trigger).
- [ ] Object counts on the target: 52 tables, 6 enums, 119 indexes, 51 functions, 57 triggers, 185 RLS policies, 16 realtime tables, 7 buckets, 24 storage policies.

## B. Manual configuration in the new project (not covered by any script)

- [ ] **Auth → URL configuration:** Site URL and redirect allow-list set to the *staging* origin for now.
- [ ] **Auth → Providers → Google:** the **existing** client ID/secret pasted in (a new OAuth client would break all 18 Google users).
- [ ] Google Cloud Console: `https://<new-ref>.supabase.co/auth/v1/callback` **added** to the authorized redirect URIs, old callback left in place.
- [ ] **Auth → Email:** confirmations ON, auto-confirm OFF, anonymous sign-in OFF; templates re-pasted; JWT expiry / refresh rotation / password policy matched.
- [ ] **Storage:** per-bucket file size limits and MIME allow-lists set to match the source.
- [ ] Function secrets present: `RESEND_API_KEY`, `EMAIL_TRANSPORT=direct`, `SENDER_DOMAIN`, `PUBLIC_APP_URL`, `STATEMENTS_CRON_SECRET`, `PAYSTACK_SECRET_KEY`, SMS keys. `AI_PROVIDER=disabled`.
- [ ] Absolute storage URLs stored in the database repointed to the new host:
      `update public.products set image_url = replace(image_url,'<old-ref>','<new-ref>') where image_url like '%<old-ref>%';`
      (same for `profiles.logo_url`, `profiles.avatar_url`, `platform_ads.image_url`, `email_media_library.url`)
- [ ] `cron.job` shows both jobs, `active = true`, pointing at `<new-ref>`.

## C. Staging app wiring

- [ ] Staging build env: `VITE_SUPABASE_URL=https://<new-ref>.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=<new anon key>`, `VITE_SUPABASE_PROJECT_ID=<new-ref>`, `VITE_AUTH_PROVIDER=supabase`.
- [ ] Build succeeds and the bundle contains **zero** occurrences of the old project ref and no Lovable auth broker.
- [ ] Staging uses a **staging-only** domain — never `kuditrack.online`.

**Safe to connect staging once A, B and C are complete.** Then run section D.

## D. Staging smoke tests (before requesting cutover approval)

- [ ] Sign in with an existing **email/password** account — no password reset needed.
- [ ] Sign in with an existing **Google** account — lands on the same user, not a new one.
- [ ] Dashboard totals match the Lovable Cloud app for the same business.
- [ ] Record a sale, an expense and a restock; check stock and ledger update.
- [ ] Open the public store page, place an order, track it, confirm receipt.
- [ ] Upload a receipt image and reopen it; open an existing logo/avatar (storage paths preserved).
- [ ] Offline mode: queue a sale offline, reconnect, confirm it syncs.
- [ ] Send a test email campaign — arrives via direct Resend, no gateway.
- [ ] Trigger the monthly-statement function manually; PDF renders.
- [ ] Paystack test payment initialises and verifies.
- [ ] AI assistant returns the friendly "AI is not enabled" reply and the offline parser still records entries.
- [ ] Super-admin pages load; a non-owner staff account sees only permitted modules (RLS spot-check).

## E. Remaining YELLOW items (manual, cutover-time)

1. Auth project settings (§B) — no dump carries them.
2. Google OAuth redirect URI + reuse of the existing client.
3. Stored absolute storage URLs — the one-off `replace()` update.
4. Per-bucket size/MIME limits.
5. `07_cron.sql` placeholders filled at run time.
6. `supabase/config.toml` `project_id` updated to the new ref for local CLI use.
7. `supabase/functions/ai-assistant/index.ts` — the live gateway implementation is
   still there by design; delete it at cutover and call `runAssistantTurn()` from
   `_shared/ai-provider.ts`.
8. Old project's cron jobs — set `active = false` at cutover (reversible) so
   monthly statements are not sent twice.

Cutover itself remains unapproved. Nothing in this package switches traffic.
