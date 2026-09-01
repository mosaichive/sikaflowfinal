#!/usr/bin/env bash
# KudiTrack — DATA-ONLY MIGRATION into a TARGET whose schema ALREADY EXISTS.
#
# Difference from ./migrate.sh: this script applies NO DDL. It never runs
# 01_schema.sql or 02_storage.sql, never creates/drops/alters a table, enum,
# policy, trigger or bucket. It only copies rows and storage objects.
#
#   cp .env.example .env && chmod 600 .env && $EDITOR .env
#   ./11_migrate_data_only.sh              # DRY_RUN=1 -> checks only, writes nothing
#   DRY_RUN=0 ./11_migrate_data_only.sh    # perform the data import
#
# The SOURCE (Lovable Cloud production) is read-only throughout: pg_dump and
# SELECT only. Every UUID, foreign key, timestamp, password hash and storage
# path is preserved verbatim.
#
# Phases:
#   0  guards + connectivity          4  application data (triggers suppressed)
#   1  schema compatibility check     5  trigger + FK verification
#   2  read-only export from source   6  storage objects (identical paths)
#   3  auth.users + auth.identities   7  source-vs-target validation report

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
load_env
cd "$PKG_DIR"
require_vars SRC_DB_URL SRC_URL SRC_SERVICE_KEY DST_REF DST_DB_URL DST_SERVICE_KEY

RUN_ID="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$PKG_DIR/runs/$RUN_ID"
mkdir -p "$LOG_DIR"
say "Run log: $LOG_DIR   (contains no secrets)"

########################### PHASE 0 — GUARDS ##################################
info "PHASE 0/7 — guards and connectivity"
need_bin psql "postgresql-client 15+"
need_bin pg_dump "postgresql-client 15+"
need_bin python3 "python 3.9+"

[[ "$DST_REF" == "$PROD_REF" || "$DST_DB_URL" == *"$PROD_REF"* ]] \
  && die "TARGET points at the Lovable Cloud PRODUCTION project ($PROD_REF). Refusing."
[[ "$DST_DB_URL" == "$SRC_DB_URL" ]] && die "DST_DB_URL equals SRC_DB_URL. Refusing."
[[ "$DST_DB_URL" == *":6543"* || "$DST_DB_URL" == *"pooler.supabase.com"* ]] \
  && die "DST_DB_URL uses the pooler. Use the direct URI on port 5432."
ok "target is a different, non-production project on a direct connection"

ssqlq -c 'select 1' >/dev/null || die "cannot reach source database"
tsqlq -c 'select 1' >/dev/null || die "cannot reach target database"
ok "both databases reachable"

au="$(tsqlq -c 'select count(*) from auth.users' 2>/dev/null || echo unknown)"
[[ "$au" == "unknown" ]] && die "cannot read auth.users on the target"
[[ "$au" == "0" ]] || die "target auth.users already has $au row(s) — refusing to merge into a non-empty auth schema (see ROLLBACK.md)."
ok "target auth.users is empty"

##################### PHASE 1 — SCHEMA COMPATIBILITY ##########################
info "PHASE 1/7 — schema compatibility (read-only on both sides, no DDL)"
bash ./10_schema_compat.sh | tee "$LOG_DIR/01-schema-compat.txt"

if is_dry; then
  echo
  ok "DRY RUN COMPLETE — schema verified compatible, nothing written to any database."
  say "When ready: DRY_RUN=0 ./11_migrate_data_only.sh"
  exit 0
fi

say
warn "LIVE DATA IMPORT. Target project: $DST_REF. No DDL will be applied. Source stays read-only."
read -r -p "Type the target project ref to continue: " confirm
[[ "$confirm" == "$DST_REF" ]] || die "Confirmation did not match. Aborted, nothing written."

######################### PHASE 2 — EXPORT (read-only) ########################
info "PHASE 2/7 — export from source (read-only)"
if [[ -n "${EXPORT_DIR:-}" && -d "${EXPORT_DIR}" ]]; then
  ok "reusing existing export: $EXPORT_DIR"
else
  EXPORT_DIR="$PKG_DIR/kuditrack-export-$RUN_ID"
  mkdir -p "$EXPORT_DIR"

  say "  full safety backup (schema + data, source unchanged)"
  pg_dump "$SRC_DB_URL" -Fc -f "$EXPORT_DIR/full-backup.dump"

  say "  auth.users + auth.identities + auth.mfa_factors"
  pg_dump "$SRC_DB_URL" --data-only --no-owner --no-privileges \
    -t 'auth.users' -t 'auth.identities' -t 'auth.mfa_factors' \
    -f "$EXPORT_DIR/auth-data.sql"

  # NOTE: no --disable-triggers here. That flag emits ALTER TABLE ... DISABLE
  # TRIGGER ALL, which needs superuser and fails on a managed target. We use
  # session_replication_role = replica instead (phase 4).
  say "  public schema data (column-qualified COPY, IDs preserved)"
  pg_dump "$SRC_DB_URL" --data-only --no-owner --no-privileges \
    --schema=public -f "$EXPORT_DIR/public-data.sql"

  say "  storage metadata + validation fingerprint"
  pg_dump "$SRC_DB_URL" --data-only --no-owner --no-privileges \
    -t 'storage.buckets' -t 'storage.objects' -f "$EXPORT_DIR/storage-metadata.sql"
  psql "$SRC_DB_URL" -Atf ./04_validation.sql > "$EXPORT_DIR/source-counts.txt"
fi
export EXPORT_DIR
ok "export dir: $EXPORT_DIR"
for f in auth-data.sql public-data.sql source-counts.txt; do
  [[ -s "$EXPORT_DIR/$f" ]] || die "export incomplete: $f missing or empty — target untouched."
done

############################ PHASE 3 — AUTH DATA ##############################
info "PHASE 3/7 — auth.users + auth.identities (UUIDs and bcrypt hashes verbatim)"
tsql --single-transaction -f "$EXPORT_DIR/auth-data.sql" > "$LOG_DIR/02-auth-data.txt" 2>&1 \
  || { cat "$LOG_DIR/02-auth-data.txt" >&2; die "auth import failed — transaction rolled back, target unchanged."; }
ok "auth data imported"

######################## PHASE 4 — APPLICATION DATA ###########################
info "PHASE 4/7 — application data (triggers suppressed so ledgers are not re-posted)"
psql "$DST_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -c "set session_replication_role = replica;" \
  -f "$EXPORT_DIR/public-data.sql" > "$LOG_DIR/03-public-data.txt" 2>&1 \
  || { cat "$LOG_DIR/03-public-data.txt" >&2; die "data import failed — rolled back, no partial rows."; }
ok "application data imported"

##################### PHASE 5 — TRIGGER + FK VERIFICATION #####################
info "PHASE 5/7 — verifying triggers live, sequences advanced, foreign keys valid"
[[ "$(tsqlq -c 'show session_replication_role')" == "origin" ]] || die "session_replication_role is not origin"
[[ "$(tsqlq -c "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgenabled<>'O'")" == "0" ]] \
  || die "some triggers are disabled on the target"

# Re-sync any identity/serial sequences to max(id) so new inserts do not collide.
tsql -c "do \$\$
declare r record; mx bigint;
begin
  for r in
    select c.relname as tbl, a.attname as col,
           pg_get_serial_sequence(quote_ident(c.relname), a.attname) as seq
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where c.relkind='r' and pg_get_serial_sequence(quote_ident(c.relname), a.attname) is not null
  loop
    execute format('select coalesce(max(%I),0) from public.%I', r.col, r.tbl) into mx;
    perform setval(r.seq, greatest(mx,1), mx > 0);
  end loop;
end \$\$;" >/dev/null
ok "sequences re-synced"

tsql -c "do \$\$ declare r record; begin for r in select conrelid::regclass t, conname c from pg_constraint where contype='f' and connamespace='public'::regnamespace loop execute format('alter table %s validate constraint %I', r.t, r.c); end loop; end \$\$;" >/dev/null
ok "all foreign keys validated"

########################## PHASE 6 — STORAGE OBJECTS ##########################
info "PHASE 6/7 — copying storage objects (identical bucket + path)"
if [[ -n "${DST_ANON_KEY:-}${DST_SERVICE_KEY:-}" ]]; then
  DST_URL="https://$DST_REF.supabase.co" ./06_storage_sync.sh > "$LOG_DIR/04-storage-objects.txt" 2>&1 \
    && ok "storage objects copied ($(grep -c '^copied' "$LOG_DIR/04-storage-objects.txt" || echo 0) files)" \
    || warn "storage copy incomplete — see $LOG_DIR/04-storage-objects.txt, safe to re-run 06_storage_sync.sh"
else
  warn "no target keys set — skipping storage objects"
fi

############################ PHASE 7 — VALIDATION #############################
info "PHASE 7/7 — source-vs-target validation report"
./09_compare.sh "$EXPORT_DIR" "$LOG_DIR" || true

echo
ok "DATA MIGRATION COMPLETE — no schema object was created, altered or dropped."
say "Report:  $LOG_DIR/VALIDATION-REPORT.md"
say "Next:    CHECKLIST.md before pointing any app at the new project."
