#!/usr/bin/env bash
# Shared helpers. Sourced by every script in this package.
# Rule: nothing in here ever echoes a secret. Connection strings are redacted
# before they reach stdout, and no secret is written into a generated file.

set -euo pipefail

# The Lovable Cloud PRODUCTION project ref. Hard-coded refusal guard: the
# target may never be this project. Do not edit this line.
PROD_REF="akmoxsaihexwjijtjzsj"

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
say()  { printf '%s\n' "$*"; }
info() { printf '%s==>%s %s\n' "$c_dim" "$c_off" "$*"; }
ok()   { printf '%sOK%s   %s\n' "$c_grn" "$c_off" "$*"; }
warn() { printf '%sWARN%s %s\n' "$c_yel" "$c_off" "$*"; }
die()  { printf '%sFAIL%s %s\n' "$c_red" "$c_off" "$*" >&2; exit 1; }

# Redact user:password@host and long tokens from any string before printing.
redact() {
  printf '%s' "$1" \
    | sed -E 's#(postgres(ql)?://[^:]+:)[^@]+@#\1********@#g' \
    | sed -E 's#(sbp_|eyJ)[A-Za-z0-9._-]{8,}#\1********#g'
}

load_env() {
  local f="$PKG_DIR/.env"
  [[ -f "$f" ]] || die "No .env found at $f — copy .env.example to .env and fill it in (see README.md)."
  local perms; perms="$(stat -c '%a' "$f" 2>/dev/null || stat -f '%Lp' "$f")"
  [[ "$perms" == "600" ]] || warn ".env is mode $perms — run: chmod 600 \"$f\""
  set -a; # shellcheck disable=SC1090
  source "$f"; set +a
}

require_vars() {
  local missing=()
  for v in "$@"; do
    [[ -n "${!v:-}" ]] || missing+=("$v")
  done
  ((${#missing[@]}==0)) || die "Missing required .env values: ${missing[*]}"
}

need_bin() { command -v "$1" >/dev/null 2>&1 || die "Required tool not found: $1 ($2)"; }

# psql against the TARGET, with ON_ERROR_STOP. Never prints the URL.
tsql()  { psql "$DST_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
tsqlq() { psql "$DST_DB_URL" -v ON_ERROR_STOP=1 -Atq "$@"; }
# psql against the SOURCE — only ever used with SELECT / pg_dump.
ssql()  { psql "$SRC_DB_URL" -v ON_ERROR_STOP=1 "$@"; }
ssqlq() { psql "$SRC_DB_URL" -v ON_ERROR_STOP=1 -Atq "$@"; }

is_dry() { [[ "${DRY_RUN:-1}" != "0" ]]; }

dry_note() { is_dry && info "${c_yel}DRY RUN${c_off} — would now: $*"; }
