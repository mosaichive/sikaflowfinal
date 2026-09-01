#!/usr/bin/env bash
# KudiTrack — SCHEMA COMPATIBILITY CHECK (read-only on BOTH databases).
#
# Use this when the TARGET schema already exists and you only want to move data.
# It compares, for the public schema:
#   - table presence
#   - column presence, data type and NOT NULL
#   - enum types and their labels
# and reports anything the data import would trip over. Writes nothing.
#
#   ./10_schema_compat.sh            # prints report, exit 1 if blocking diffs
#
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
load_env
require_vars SRC_DB_URL DST_DB_URL

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

cols_sql="
select table_name||'|'||column_name||'|'||data_type||'|'||is_nullable
from information_schema.columns
where table_schema='public'
  and table_name in (select table_name from information_schema.tables
                     where table_schema='public' and table_type='BASE TABLE')
order by 1;"

enums_sql="
select t.typname||'|'||e.enumlabel
from pg_type t join pg_enum e on e.enumtypid=t.oid
join pg_namespace n on n.oid=t.typnamespace and n.nspname='public'
order by 1;"

tables_sql="
select table_name from information_schema.tables
where table_schema='public' and table_type='BASE TABLE' order by 1;"

info "Reading source schema (read-only)"
ssqlq -c "$tables_sql" > "$TMP/src-tables.txt"
ssqlq -c "$cols_sql"   > "$TMP/src-cols.txt"
ssqlq -c "$enums_sql"  > "$TMP/src-enums.txt"

info "Reading target schema (read-only)"
tsqlq -c "$tables_sql" > "$TMP/dst-tables.txt"
tsqlq -c "$cols_sql"   > "$TMP/dst-cols.txt"
tsqlq -c "$enums_sql"  > "$TMP/dst-enums.txt"

blocking=0

report() { # label, file-of-missing-lines
  local label="$1" f="$2"
  if [[ -s "$f" ]]; then
    printf '%sFAIL%s %s (%s):\n' "$c_red" "$c_off" "$label" "$(wc -l < "$f" | tr -d ' ')"
    sed 's/^/      /' "$f"
    blocking=$((blocking+1))
  else
    ok "$label: none"
  fi
}

info "Tables present in source but MISSING in target"
comm -23 "$TMP/src-tables.txt" "$TMP/dst-tables.txt" > "$TMP/missing-tables.txt"
report "missing tables" "$TMP/missing-tables.txt"

info "Columns present in source but MISSING/DIFFERENT in target"
comm -23 "$TMP/src-cols.txt" "$TMP/dst-cols.txt" > "$TMP/missing-cols.txt"
report "missing or mismatched columns" "$TMP/missing-cols.txt"

info "Enum labels present in source but MISSING in target"
comm -23 "$TMP/src-enums.txt" "$TMP/dst-enums.txt" > "$TMP/missing-enums.txt"
report "missing enum labels" "$TMP/missing-enums.txt"

info "Extra columns in target that are NOT NULL without a default (would block inserts)"
tsqlq -c "
select c.table_name||'.'||c.column_name
from information_schema.columns c
where c.table_schema='public' and c.is_nullable='NO' and c.column_default is null
order by 1;" > "$TMP/dst-notnull.txt"
comm -13 <(cut -d'|' -f1,2 "$TMP/src-cols.txt" | tr '|' '.' | sort) \
         <(sort "$TMP/dst-notnull.txt") > "$TMP/risky.txt"
if [[ -s "$TMP/risky.txt" ]]; then
  warn "target-only NOT NULL columns without defaults:"
  sed 's/^/      /' "$TMP/risky.txt"
else
  ok "no target-only NOT NULL columns without defaults"
fi

info "Target tables that already contain rows"
tsqlq -c "
select relname||' = '||n_live_tup from pg_stat_user_tables
where schemaname='public' and n_live_tup > 0 order by n_live_tup desc;" > "$TMP/nonempty.txt"
if [[ -s "$TMP/nonempty.txt" ]]; then
  warn "target is not empty — the data import expects empty tables:"
  sed 's/^/      /' "$TMP/nonempty.txt"
else
  ok "all target public tables are empty"
fi

echo
if ((blocking>0)); then
  die "$blocking blocking schema difference(s). Fix the TARGET schema (add the missing objects) and re-run. Nothing was written."
fi
ok "SCHEMA COMPATIBLE — data-only migration can proceed."
