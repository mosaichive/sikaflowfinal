#!/usr/bin/env bash
# KudiTrack — IMPORT into the NEW external Supabase project.
# Only ever run against the TARGET database. Never against the current one.
#
#   export DST_DB_URL="postgresql://postgres:<pwd>@<new-host>:5432/postgres"
#   export EXPORT_DIR="./kuditrack-export-YYYYMMDD-HHMM"
#
set -euo pipefail
: "${DST_DB_URL:?set DST_DB_URL}"; : "${EXPORT_DIR:?set EXPORT_DIR}"

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

echo "==> 5/5 Validation fingerprint"
psql "$DST_DB_URL" -Atf ./04_validation.sql > "$EXPORT_DIR/target-counts.txt"
diff "$EXPORT_DIR/source-counts.txt" "$EXPORT_DIR/target-counts.txt" && echo "MATCH ✅" || echo "DIFFERENCES ABOVE ⚠️"
