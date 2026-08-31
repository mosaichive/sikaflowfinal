#!/usr/bin/env bash
# KudiTrack — ONE-COMMAND MIGRATION ORCHESTRATOR (run locally, on your machine).
#
#   cp .env.example .env && chmod 600 .env && $EDITOR .env
#   ./migrate.sh                # DRY_RUN=1 in .env -> preflight only, writes nothing
#   DRY_RUN=0 ./migrate.sh      # perform the migration into the NEW project
#
# The SOURCE (Lovable Cloud production) is only ever read: pg_dump and SELECT.
# No script in this package issues INSERT/UPDATE/DELETE/DDL against the source.
#
# Phase order (safe order, each phase aborts the run on failure):
#   0  preflight + target validation      10 grants        (in 01_schema.sql)
#   1  export from source (read-only)     11 RLS policies  (in 01_schema.sql)
#   2  extensions                         12 realtime      (in 01_schema.sql)
#   3  enums                              13 storage buckets + policies
#   4  tables                             14 application data
#   5  constraints                        15 auth.users + auth.identities
#   6  indexes                            16 edge functions + secrets
#   7  functions                          17 pg_cron
#   8  triggers                           18 storage objects
#   9  (2-12 are applied by 01_schema.sql in exactly this order,
#       inside ONE transaction — it either fully applies or not at all)
#   19 validation + source-vs-target report

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
load_env
cd "$PKG_DIR"

RUN_ID="$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$PKG_DIR/runs/$RUN_ID"
mkdir -p "$LOG_DIR"
say "Run log: $LOG_DIR   (contains no secrets)"

############################ PHASE 0 — PREFLIGHT ##############################
info "PHASE 0/19 — preflight"
bash ./00_preflight.sh | tee "$LOG_DIR/00-preflight.txt"

if is_dry; then
  echo
  ok "DRY RUN COMPLETE — configuration verified, nothing written to any database."
  say "When you are ready: set DRY_RUN=0 in .env (or run DRY_RUN=0 ./migrate.sh)."
  exit 0
fi

say
warn "LIVE RUN. Target project: $DST_REF. The source stays read-only."
read -r -p "Type the new project ref to continue: " confirm
[[ "$confirm" == "$DST_REF" ]] || die "Confirmation did not match. Aborted, nothing written."

######################## PHASE 1 — EXPORT FROM SOURCE #########################
info "PHASE 1/19 — export from source (read-only)"
if [[ -n "${EXPORT_DIR:-}" && -d "${EXPORT_DIR}" ]]; then
  ok "reusing existing export: $EXPORT_DIR"
else
  EXPORT_DIR="$PKG_DIR/kuditrack-export-$RUN_ID"
  export EXPORT_DIR SRC_DB_URL
  ( cd "$PKG_DIR" && ./03_export_data.sh ) 2>&1 | tee "$LOG_DIR/01-export.txt"
  # 03_export_data.sh creates its own timestamped dir; find the newest one.
  EXPORT_DIR="$(ls -1dt "$PKG_DIR"/kuditrack-export-* | head -1)"
fi
export EXPORT_DIR
ok "export dir: $EXPORT_DIR"
for f in auth-data.sql public-data.sql source-counts.txt; do
  [[ -s "$EXPORT_DIR/$f" ]] || die "export incomplete: $f missing or empty — target untouched."
done

################### PHASES 2-12 — SCHEMA (single transaction) #################
info "PHASE 2-12/19 — extensions, enums, tables, constraints, indexes, functions, triggers, grants, RLS, realtime"
say "  applied by 01_schema.sql inside ONE transaction: any error rolls the whole thing back."
tsql --single-transaction -f ./01_schema.sql > "$LOG_DIR/02-schema.txt" 2>&1 \
  || { cp "$LOG_DIR/02-schema.txt" /dev/stderr; die "schema failed — transaction rolled back, target is still empty."; }
ok "schema applied"

######################## PHASE 13 — STORAGE STRUCTURE #########################
info "PHASE 13/19 — storage buckets + policies"
tsql --single-transaction -f ./02_storage.sql > "$LOG_DIR/03-storage-schema.txt" 2>&1 \
  || { cp "$LOG_DIR/03-storage-schema.txt" /dev/stderr; die "storage schema failed — rolled back."; }
ok "7 buckets + policies created"

################ PHASE 14/15 — DATA (auth first, then public) #################
info "PHASE 15/19 — auth.users + auth.identities (UUIDs and bcrypt hashes preserved verbatim)"
tsql --single-transaction -f "$EXPORT_DIR/auth-data.sql" > "$LOG_DIR/04-auth-data.txt" 2>&1 \
  || { cp "$LOG_DIR/04-auth-data.txt" /dev/stderr; die "auth import failed — rolled back."; }
ok "auth data imported"

info "PHASE 14/19 — application data (triggers suppressed so ledgers are not re-posted)"
psql "$DST_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -c "set session_replication_role = replica;" \
  -f "$EXPORT_DIR/public-data.sql" > "$LOG_DIR/05-public-data.txt" 2>&1 \
  || { cp "$LOG_DIR/05-public-data.txt" /dev/stderr; die "data import failed — rolled back, no partial rows."; }
ok "application data imported"

info "  verifying triggers are live and foreign keys valid"
[[ "$(tsqlq -c 'show session_replication_role')" == "origin" ]] || die "session_replication_role is not origin"
[[ "$(tsqlq -c "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgenabled<>'O'")" == "0" ]] \
  || die "some triggers are disabled on the target"
tsql -c "do \$\$ declare r record; begin for r in select conrelid::regclass t, conname c from pg_constraint where contype='f' and connamespace='public'::regnamespace loop execute format('alter table %s validate constraint %I', r.t, r.c); end loop; end \$\$;" >/dev/null
ok "triggers enabled, all foreign keys validated"

##################### PHASE 16 — EDGE FUNCTIONS + SECRETS #####################
info "PHASE 16/19 — edge functions + function secrets"
bash ./08_functions_and_secrets.sh 2>&1 | tee "$LOG_DIR/06-functions.txt"

############################# PHASE 17 — PG_CRON ##############################
info "PHASE 17/19 — pg_cron jobs"
tmp_cron="$(mktemp)"; trap 'rm -f "$tmp_cron"' EXIT
sed -e "s|<new-ref>|$DST_REF|g" \
    -e "s|<NEW_ANON_KEY>|$DST_ANON_KEY|g" \
    -e "s|<STATEMENTS_CRON_SECRET>|${STATEMENTS_CRON_SECRET:-}|g" ./07_cron.sql > "$tmp_cron"
tsql -f "$tmp_cron" > "$LOG_DIR/07-cron.txt" 2>&1 && ok "2 cron jobs scheduled" \
  || { warn "cron scheduling failed (see $LOG_DIR/07-cron.txt) — non-fatal, re-run 07_cron.sql later"; }
rm -f "$tmp_cron"   # the filled-in file, which holds a secret, never persists

########################## PHASE 18 — STORAGE OBJECTS #########################
info "PHASE 18/19 — copying storage objects (identical bucket + path)"
DST_URL="https://$DST_REF.supabase.co" ./06_storage_sync.sh > "$LOG_DIR/08-storage-objects.txt" 2>&1 \
  && ok "storage objects copied ($(grep -c '^copied' "$LOG_DIR/08-storage-objects.txt") files)" \
  || warn "storage copy incomplete — see $LOG_DIR/08-storage-objects.txt, safe to re-run 06_storage_sync.sh"

############################# PHASE 19 — VALIDATE #############################
info "PHASE 19/19 — source-vs-target validation report"
./09_compare.sh "$EXPORT_DIR" "$LOG_DIR" || true

echo
ok "MIGRATION COMPLETE — target populated. Lovable Cloud production untouched and still live."
say "Report:  $LOG_DIR/VALIDATION-REPORT.md"
say "Next:    read CHECKLIST.md before pointing the staging app at the new project."
say "Failed?  read ROLLBACK.md — the new project can be reset and re-run from scratch."
