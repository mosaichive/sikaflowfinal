# KudiTrack — data-only migration (target schema already exists)

Use this path when the **new Supabase project already has the KudiTrack schema
created** and you only want to move the production data across.

It applies **no DDL at all**: no `CREATE`, `ALTER` or `DROP` of any table, enum,
index, function, trigger, policy or bucket on the target. It copies rows and
storage objects only. `01_schema.sql` and `02_storage.sql` are never executed.

The **source** (Lovable Cloud production) is read-only for the whole run —
`pg_dump` and `SELECT` only. Nothing on production is switched, changed or
deleted.

---

## 1. Prerequisites

| Tool | Why | Install |
|---|---|---|
| `psql` + `pg_dump` 15+ | export/import | `brew install postgresql@16` / `apt install postgresql-client-16` |
| `python3` 3.9+ | storage object copy | preinstalled |
| `curl`, `bash` 4+ | scripts | preinstalled (macOS: `brew install bash`) |

## 2. Configure

```bash
cd supabase/migration-package
cp .env.example .env
chmod 600 .env
$EDITOR .env
```

Fill in:

- `SRC_DB_URL`, `SRC_URL`, `SRC_SERVICE_KEY` — the current Lovable Cloud project (read-only).
- `DST_REF` — new project ref (Project Settings → General → Reference ID).
- `DST_DB_URL` — new project **direct** connection URI, port **5432** (not the 6543 pooler).
- `DST_SERVICE_KEY`, `DST_ANON_KEY` — new project API keys.

`.env` is git-ignored. Confirm with
`git check-ignore -v supabase/migration-package/.env`.

## 3. Check schema compatibility (read-only, writes nothing)

```bash
./10_schema_compat.sh
```

Compares source vs target `public` schema and reports:

- tables in source missing from target;
- columns missing or with a different type / nullability;
- enum labels missing on the target;
- target-only `NOT NULL` columns without defaults (would block inserts);
- any target table that already holds rows.

Fix anything reported as `FAIL` **on the target** (add the missing object
yourself — this package will not do it for you), then re-run until it prints
`SCHEMA COMPATIBLE`.

## 4. Dry run (writes nothing, anywhere)

With `DRY_RUN="1"` (the default):

```bash
./11_migrate_data_only.sh
```

Runs guards + the compatibility check, then stops:

- target is **not** the Lovable Cloud production ref (hard-coded refusal);
- target ≠ source; direct connection, not the pooler;
- both databases reachable;
- target `auth.users` is empty (refuses to merge into a populated auth schema);
- schema compatible.

## 5. Live data import

```bash
DRY_RUN=0 ./11_migrate_data_only.sh
```

You must type the target project ref to confirm.

| Phase | What |
|---|---|
| 0 | Guards + connectivity |
| 1 | Schema compatibility (no DDL) |
| 2 | Read-only export from source: full safety dump, `auth` data, `public` data, storage metadata, fingerprint |
| 3 | `auth.users` + `auth.identities` (+ `mfa_factors`) — UUIDs, bcrypt hashes and provider IDs verbatim |
| 4 | Application data with `session_replication_role = replica` so ledger/sales triggers do not re-fire |
| 5 | Triggers verified live, serial sequences re-synced to `max(id)`, every foreign key re-validated |
| 6 | Storage objects copied at identical bucket + path |
| 7 | Source-vs-target validation report |

Each database phase runs inside a single transaction with `ON_ERROR_STOP=1`:
any error rolls that phase back completely and aborts the run, so the target is
never left half-populated.

**Preserved exactly:** every UUID and timestamp, all foreign-key relationships,
auth user IDs, identities and password hashes, businesses, products, customers,
sales, sale items, expenses, other income, restocks, inventory and stock
movements, orders, savings, investments, subscription payments, audit logs and
all storage object paths.

## 6. Validate

`runs/<timestamp>/VALIDATION-REPORT.md` diffs source vs target on row counts,
UUID digests, password-hash digest, financial sums, storage paths, policies,
functions, triggers and indexes. Re-runnable:

```bash
./09_compare.sh ./kuditrack-export-YYYYMMDD-HHMMSS
```

## 7. Not included in this path (intentionally)

Because you already own the target schema, these stay under your control:

- `08_functions_and_secrets.sh` — deploy Edge Functions + set secrets (run manually if needed);
- `07_cron.sql` — `pg_cron` jobs (run manually if needed);
- Auth provider config (Google OAuth client, redirect URLs, email templates);
- Bucket public/private flags and size limits.

`CHECKLIST.md` lists the manual configuration; `ROLLBACK.md` covers resetting
the target if you want to re-run from scratch.

## 8. If you want the schema created for you instead

Use `./migrate.sh` (see `README.md`) — that path requires a completely empty
target and applies `01_schema.sql` + `02_storage.sql` first.
