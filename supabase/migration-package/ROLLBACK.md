# Rollback — for the NEW Supabase project

Nothing here touches Lovable Cloud. Production is untouched by design and remains
your live, complete rollback environment for as long as you leave it running.

## What "rollback" means at this stage

Production traffic has **not** been switched. So a failed migration has no user
impact at all: you simply reset the new project and run the package again.
The Lovable Cloud app keeps serving every user throughout.

## If a phase fails mid-run

`migrate.sh` applies schema, storage schema, auth data and application data each
inside a **single transaction** with `ON_ERROR_STOP=1`. A failure in any of them
rolls that phase back completely — you never get half a table or half the rows.
The run then aborts before the next phase.

| Failed phase | State of the target | Action |
|---|---|---|
| Preflight | untouched | fix `.env`, re-run |
| Schema (2–12) | rolled back, still empty | fix, re-run `./migrate.sh` |
| Storage schema (13) | schema present, no data | run "Full reset" below, re-run |
| Auth data (15) | schema present, no rows | full reset, re-run |
| Application data (14) | auth rows present, public rows rolled back | full reset, re-run |
| Functions/secrets (16) | data intact | re-run `./08_functions_and_secrets.sh` only |
| pg_cron (17) | data intact | re-run `07_cron.sql` with the placeholders filled |
| Storage objects (18) | data intact, some files copied | re-run `./06_storage_sync.sh` — it overwrites by identical path, safe to repeat |
| Validation (19) | data intact | read the report; usually full reset + re-run |

## Full reset of the NEW project

Two options. Both apply **only** to the new project.

**A. Delete and recreate the project** (cleanest, recommended).
Supabase Dashboard → new project → Settings → General → Delete project. Create a
fresh one, update `DST_REF`, `DST_DB_URL`, `DST_SERVICE_KEY`, `DST_ANON_KEY` in
`.env`, re-run `./migrate.sh`.

**B. Wipe in place** (faster). Run against the **target** only — check twice that
the connection string is not the production one:

```sql
-- TARGET ONLY. Verify: select current_setting('app.settings.project_ref', true);
select cron.unschedule(jobname) from cron.job;         -- if pg_cron installed
drop schema public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
delete from storage.objects;
delete from storage.buckets;
delete from auth.identities;
delete from auth.users;
```

Then re-run `./migrate.sh`. The preflight's empty-target guard will pass again.

## Rolling back after cutover (future stage, not yet approved)

1. Repoint DNS for `kuditrack.online` / `www` back to the Lovable Cloud deployment.
2. Re-enable the old cron jobs if you deactivated them: `update cron.job set active = true;`
3. Leave `EMAIL_TRANSPORT` unset on Lovable Cloud — it already defaults to `gateway`.
4. Keep the old Google OAuth redirect URI in the Google client until rollback is retired.
5. Writes made on the new stack after cutover will not exist on Lovable Cloud — define
   and communicate the rollback window (recommended: same day) before switching traffic.

The only irreversible action in this entire plan is deleting or pausing the Lovable
Cloud project. Do not do that until the new stack has run a full validation window.
