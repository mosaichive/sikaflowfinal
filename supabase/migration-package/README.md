# KudiTrack — self-contained migration package

Run this **on your own machine**. Every credential for the new Supabase project
stays in a local, git-ignored `.env` file. Nothing in this package transmits your
database password, service-role key or personal access token anywhere except to
the two Supabase endpoints you name, and no script prints a secret to the
terminal or writes one into a file that gets committed.

The **source** (Lovable Cloud production) is read-only for the entire package:
only `pg_dump` and `SELECT` ever run against it. Production traffic is not
switched, no production env var is changed, nothing is deleted from the source.
Lovable Cloud stays fully operational as the rollback environment.

---

## 1. Prerequisites

| Tool | Why | Install |
|---|---|---|
| `psql` + `pg_dump` 15+ | schema and data | `brew install postgresql@16` / `apt install postgresql-client-16` |
| `python3` 3.9+ | storage object copy | preinstalled on macOS/Linux |
| `supabase` CLI | edge functions + secrets | `npm i -g supabase` |
| `curl`, `bash` 4+ | scripts | preinstalled (macOS: `brew install bash`) |

## 2. Credentials — where to find each one

All four come from the **new** project in the Supabase Dashboard.

1. **Project Ref** — Project Settings → General → *Reference ID*.
   20 lowercase letters, e.g. `abcdefghijklmnopqrst`.
2. **Database connection string** — Project Settings → Database → *Connection
   string* → **URI**. Use the **direct** connection on port **5432** (not the
   pooler on 6543). Replace `[YOUR-PASSWORD]` with the database password you
   chose when creating the project; if you lost it, *Reset database password*
   on the same page.
3. **Service-role key** — Project Settings → API Keys → `service_role` →
   *Reveal*. Secret: server-side only, never in a browser bundle, never in Vercel.
4. **Supabase Personal Access Token** — <https://supabase.com/dashboard/account/tokens>
   → *Generate new token*. Used only by the CLI to deploy functions and set
   secrets. Revoke it after the migration if you do not need it.

Keep all four in your password manager. Do not paste them into any chat, issue
tracker, or AI tool — including this one.

## 3. Configure

```bash
cd supabase/migration-package
cp .env.example .env
chmod 600 .env
$EDITOR .env          # fill in SRC_* (source) and DST_* (new project)
```

`.env` is covered by the repo's root `.gitignore` (`.env`, `.env.*`). Confirm
with `git check-ignore -v supabase/migration-package/.env`.

## 4. Dry run first (writes nothing, anywhere)

With `DRY_RUN="1"` (the default in `.env.example`):

```bash
./migrate.sh
```

This runs the mandatory preflight only:

- required tools present;
- all required `.env` values set;
- **GUARD 1** — the target is **not** the Lovable Cloud production ref (hard-coded refusal);
- **GUARD 2** — target ≠ source;
- **GUARD 3** — the source really is the expected production project;
- **GUARD 4** — direct connection, not the pooler;
- both databases reachable;
- target `public` schema has no KudiTrack tables and `auth.users` is empty;
- Supabase roles and required extensions available on the target;
- all nine package files present; no secret embedded in any package file.

Any failure aborts with `FAIL` and writes nothing.

## 5. Live migration

```bash
DRY_RUN=0 ./migrate.sh      # or set DRY_RUN="0" in .env
```

You must type the new project ref to confirm. Phase order:

| Phase | What |
|---|---|
| 0 | Preflight (all guards above) |
| 1 | Export from source — `pg_dump` (read-only): full backup, `auth` data, `public` data, storage metadata, source fingerprint |
| 2–12 | `01_schema.sql` in **one transaction**: extensions → enums → tables → constraints → indexes → functions → triggers → grants → RLS enable → policies → realtime publication |
| 13 | `02_storage.sql` — 7 buckets + 24 policies, one transaction |
| 15 | `auth.users` + `auth.identities` — UUIDs, bcrypt hashes, provider IDs preserved verbatim |
| 14 | Application data with `session_replication_role = replica` so ledger triggers do not re-fire; then triggers verified live and every FK re-validated |
| 16 | Edge functions deployed + function secrets set (`08_functions_and_secrets.sh`) |
| 17 | `pg_cron` jobs, placeholders filled at run time into a temp file that is deleted |
| 18 | Storage objects copied at **identical bucket + path** |
| 19 | Source-vs-target validation report |

**Failure behaviour:** each database phase runs with `ON_ERROR_STOP=1` inside a
single transaction. Any error rolls that phase back entirely and aborts the run —
the target is never left partially modified. See `ROLLBACK.md` for what to do next.

**Preserved exactly:** every UUID and timestamp, all foreign-key relationships,
auth user IDs, auth identities and password hashes, businesses, products,
customers, sales, sale items, expenses, other income, restocks, inventory and
stock movements, orders, savings, investments, subscription payments, audit logs,
and all storage object paths.

## 6. Validation

`runs/<timestamp>/VALIDATION-REPORT.md` compares source and target on: user
counts, user UUID digest, auth identities and provider IDs, password-hash digest,
businesses, products, customers, sales, sale items, expenses, other income,
inventory/restocks, stock movements, orders, financial sums, audit logs, storage
objects and path digest, RLS policies, functions, triggers, indexes, enums,
realtime tables and cron jobs — plus orphan/grant/trigger integrity checks and a
full fingerprint diff. Re-runnable at any time:

```bash
./09_compare.sh ./kuditrack-export-YYYYMMDD-HHMMSS
```

## 7. Then what

Read `CHECKLIST.md` — it says exactly when it is safe to point the **staging**
KudiTrack app at the new project, and lists the manual auth/OAuth/storage
configuration no script can do. `ROLLBACK.md` covers resetting the new project.

Production cutover is a separate, later, explicitly approved step. Nothing in
this package switches traffic.

## Files

| File | Purpose |
|---|---|
| `.env.example` | template for local-only credentials |
| `lib/common.sh` | shared helpers, secret redaction, production-ref guard |
| `00_preflight.sh` | mandatory read-only preflight |
| `migrate.sh` | orchestrator (dry-run by default) |
| `01_schema.sql` | full DDL in safe order, one transaction |
| `02_storage.sql` | buckets + storage policies |
| `03_export_data.sh` | read-only export from source |
| `04_validation.sql` | fingerprint, identical on both sides |
| `05_import_data.sh` | standalone import (manual alternative to `migrate.sh`) |
| `06_storage_sync.sh` | copies storage objects, identical paths |
| `07_cron.sql` | pg_cron jobs (placeholders filled at run time) |
| `08_functions_and_secrets.sh` | deploy edge functions, set secrets |
| `09_compare.sh` | source-vs-target validation report |
| `ROLLBACK.md` | reset/rollback for the new project |
| `CHECKLIST.md` | final go/no-go before connecting staging |
