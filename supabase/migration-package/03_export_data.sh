#!/usr/bin/env bash
# KudiTrack — DATA EXPORT (read-only against the CURRENT production database)
# Run this from YOUR machine. It never writes to the source database.
#
# Prereqs: postgresql-client 15+ (pg_dump), supabase CLI (for storage), the
# CURRENT project's database connection string in SRC_DB_URL.
#
#   export SRC_DB_URL="postgresql://postgres:<pwd>@<host>:5432/postgres"
#
set -euo pipefail
OUT="./kuditrack-export-$(date +%Y%m%d-%H%M)"
mkdir -p "$OUT"

echo "==> 1/4 Full logical backup (safety copy, schema + data, all schemas)"
pg_dump "$SRC_DB_URL" -Fc -f "$OUT/full-backup.dump"

echo "==> 2/4 auth schema data (users, identities, sessions metadata)"
# auth.users carries encrypted_password (bcrypt) — it moves as-is, so passwords
# and user UUIDs are preserved. Do NOT edit these files.
pg_dump "$SRC_DB_URL" --data-only --no-owner --no-privileges \
  -t 'auth.users' -t 'auth.identities' -t 'auth.mfa_factors' \
  -f "$OUT/auth-data.sql"

echo "==> 3/4 public schema data (all business data, IDs and timestamps preserved)"
pg_dump "$SRC_DB_URL" --data-only --no-owner --no-privileges \
  --disable-triggers --schema=public \
  -f "$OUT/public-data.sql"

echo "==> 4/4 storage object metadata"
pg_dump "$SRC_DB_URL" --data-only --no-owner --no-privileges \
  -t 'storage.buckets' -t 'storage.objects' \
  -f "$OUT/storage-metadata.sql"

echo "==> Row-count fingerprint (for post-migration validation)"
psql "$SRC_DB_URL" -Atf ./04_validation.sql > "$OUT/source-counts.txt"

echo "Done: $OUT"
