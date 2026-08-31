#!/usr/bin/env bash
# KudiTrack — IMPORT into the NEW external Supabase project.
# Only ever run against the TARGET database. Never against the current one.
#
#   export DST_DB_URL="postgresql://postgres:<pwd>@<new-host>:5432/postgres"
#   export EXPORT_DIR="./kuditrack-export-YYYYMMDD-HHMM"
#
set -euo pipefail
: "${DST_DB_URL:?set DST_DB_URL}"; : "${EXPORT_DIR:?set EXPORT_DIR}"

echo "==> Guard: refuse to run against the Lovable Cloud source project"
if [[ "$DST_DB_URL" == *akmoxsaihexwjijtjzsj* ]]; then
  echo "DST_DB_URL points at the CURRENT production project — refusing."; exit 1
fi
if [[ -n "${SRC_DB_URL:-}" && "$DST_DB_URL" == "$SRC_DB_URL" ]]; then
  echo "DST_DB_URL equals SRC_DB_URL — refusing."; exit 1
fi

echo "==> Guard: target must be empty of KudiTrack tables"
if psql "$DST_DB_URL" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_name='profiles'" | grep -q '^1$'; then
  echo "Target already has public.profiles — refusing to continue."; exit 1
fi

echo "==> 1/5 Schema"
psql "$DST_DB_URL" -v ON_ERROR_STOP=1 -f ./01_schema.sql

echo "==> 2/5 Auth users + identities (preserves UUIDs and bcrypt passwords)"
psql "$DST_DB_URL" -v ON_ERROR_STOP=1 -f "$EXPORT_DIR/auth-data.sql"

echo "==> 3/5 Public data (triggers disabled so ledgers are not re-run)"
psql "$DST_DB_URL" -v ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica;" \
  -f "$EXPORT_DIR/public-data.sql"

echo "==> 4/5 Storage buckets + policies, then object metadata"
psql "$DST_DB_URL" -v ON_ERROR_STOP=1 -f ./02_storage.sql
# Import object rows only AFTER the files have been uploaded (06_storage_sync.sh)
echo "    (skip storage-metadata.sql if you re-upload files via the Storage API —"
echo "     the API recreates storage.objects rows with the same paths)"

echo "==> 4b/5 Confirm triggers are live again (session_replication_role is per-session,"
echo "        so it reset when the psql session above ended). Verifying:"
psql "$DST_DB_URL" -Atc "show session_replication_role" | grep -qi '^origin$' \
  || { echo "session_replication_role is NOT origin — investigate before going live."; exit 1; }
psql "$DST_DB_URL" -Atc "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgenabled <> 'O'" | grep -q '^0$' \
  || { echo "Some triggers are disabled (tgenabled <> O) — re-enable before going live."; exit 1; }

echo "==> 4c/5 Foreign-key integrity"
psql "$DST_DB_URL" -v ON_ERROR_STOP=1 -c "do \$\$ declare r record; begin for r in select conrelid::regclass t, conname c from pg_constraint where contype='f' and connamespace='public'::regnamespace loop execute format('alter table %s validate constraint %I', r.t, r.c); end loop; end \$\$;"

echo "==> 5/5 Validation fingerprint"
psql "$DST_DB_URL" -Atf ./04_validation.sql > "$EXPORT_DIR/target-counts.txt"
diff "$EXPORT_DIR/source-counts.txt" "$EXPORT_DIR/target-counts.txt" && echo "MATCH ✅" || echo "DIFFERENCES ABOVE ⚠️"
