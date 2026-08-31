#!/usr/bin/env bash
# KudiTrack — MANDATORY PREFLIGHT. Read-only everywhere. Writes nothing.
# Run standalone:  ./00_preflight.sh
# Also run automatically as the first phase of ./migrate.sh.

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
load_env

fails=0
check_fail() { printf '%sFAIL%s %s\n' "$c_red" "$c_off" "$*"; fails=$((fails+1)); }

info "Tooling"
for pair in "psql:postgresql-client 15+" "pg_dump:postgresql-client 15+" "python3:python 3.9+" "curl:curl"; do
  b="${pair%%:*}"; h="${pair#*:}"
  command -v "$b" >/dev/null 2>&1 && ok "$b found" || check_fail "$b missing ($h)"
done
command -v supabase >/dev/null 2>&1 && ok "supabase CLI found" \
  || warn "supabase CLI missing — needed only for edge functions/secrets (npm i -g supabase)"

info "Required configuration present"
for v in SRC_DB_URL SRC_URL SRC_SERVICE_KEY DST_REF DST_DB_URL DST_SERVICE_KEY DST_ANON_KEY; do
  [[ -n "${!v:-}" ]] && ok "$v set" || check_fail "$v is empty in .env"
done

info "GUARD 1 — target must NOT be the Lovable Cloud production project"
if [[ "$DST_REF" == "$PROD_REF" || "$DST_DB_URL" == *"$PROD_REF"* || "${DST_URL:-}" == *"$PROD_REF"* ]]; then
  check_fail "TARGET points at the Lovable Cloud PRODUCTION project ($PROD_REF). Refusing."
else
  ok "target ref is not the production ref"
fi

info "GUARD 2 — target must differ from source"
if [[ "$DST_DB_URL" == "$SRC_DB_URL" ]]; then
  check_fail "DST_DB_URL equals SRC_DB_URL. Refusing."
else
  ok "source and target connection strings differ"
fi

info "GUARD 3 — source connection string really is the production project"
if [[ "$SRC_DB_URL" == *"$PROD_REF"* || "$SRC_URL" == *"$PROD_REF"* ]]; then
  ok "source recognised as the Lovable Cloud project (read-only for this package)"
else
  warn "source does not contain the expected production ref — double-check SRC_DB_URL/SRC_URL"
fi

info "GUARD 4 — direct connection, not the transaction pooler"
if [[ "$DST_DB_URL" == *":6543"* || "$DST_DB_URL" == *"pooler.supabase.com"* ]]; then
  check_fail "DST_DB_URL uses the pooler. Use the direct URI on port 5432."
else
  ok "target uses a direct connection"
fi

info "Connectivity"
if ssqlq -c 'select 1' >/dev/null 2>&1; then ok "source reachable (read-only)"; else check_fail "cannot reach source database"; fi
if tsqlq -c 'select 1' >/dev/null 2>&1; then ok "target reachable"; else check_fail "cannot reach target database — check password/host in DST_DB_URL"; fi

if tsqlq -c 'select 1' >/dev/null 2>&1; then
  info "Target must be empty of KudiTrack objects"
  n="$(tsqlq -c "select count(*) from information_schema.tables where table_schema='public' and table_name in ('profiles','sales','products')")"
  if [[ "$n" == "0" ]]; then ok "target public schema has no KudiTrack tables"; else check_fail "target already contains KudiTrack tables ($n found) — see ROLLBACK.md to reset it"; fi

  u="$(tsqlq -c 'select count(*) from auth.users' 2>/dev/null || echo unknown)"
  if [[ "$u" == "0" ]]; then ok "target auth.users is empty"
  elif [[ "$u" == "unknown" ]]; then check_fail "cannot read auth.users on the target"
  else check_fail "target auth.users already has $u rows — refusing to merge into a non-empty auth schema"; fi

  info "Target prerequisites"
  for r in anon authenticated service_role authenticator; do
    [[ "$(tsqlq -c "select count(*) from pg_roles where rolname='$r'")" == "1" ]] && ok "role $r exists" || check_fail "role $r missing (is this a real Supabase project?)"
  done
  for e in pgcrypto uuid-ossp pg_net pg_cron; do
    if [[ "$(tsqlq -c "select count(*) from pg_available_extensions where name='$e'")" == "1" ]]; then ok "extension available: $e"; else warn "extension not available on target: $e"; fi
  done
fi

info "Package integrity"
for f in 01_schema.sql 02_storage.sql 03_export_data.sh 04_validation.sql 05_import_data.sh 06_storage_sync.sh 07_cron.sql 08_functions_and_secrets.sh 09_compare.sh; do
  [[ -f "$PKG_DIR/$f" ]] && ok "$f present" || check_fail "$f missing from the package"
done

info "Secret hygiene"
if grep -RIlE 'sbp_[A-Za-z0-9]{20,}|service_role.*eyJ' "$PKG_DIR" --exclude=.env --exclude-dir=.git >/dev/null 2>&1; then
  check_fail "a token-looking string was found inside the package files"
else
  ok "no secrets embedded in package files"
fi
[[ -f "$PKG_DIR/.env" ]] && { git -C "$PKG_DIR" check-ignore -q "$PKG_DIR/.env" 2>/dev/null && ok ".env is git-ignored" || warn "could not confirm .env is git-ignored — do not commit it"; }

echo
if ((fails>0)); then
  die "$fails preflight check(s) failed. Nothing was written anywhere. Fix the above and re-run."
fi
ok "PREFLIGHT PASSED — target verified, production untouched."
is_dry && warn "DRY_RUN=1 — ./migrate.sh will stop after preflight. Set DRY_RUN=0 in .env to import."
