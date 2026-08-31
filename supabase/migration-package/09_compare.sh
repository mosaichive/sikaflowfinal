#!/usr/bin/env bash
# KudiTrack — SOURCE vs TARGET validation report.
#   ./09_compare.sh <export-dir> [out-dir]
# Read-only on both databases. Writes VALIDATION-REPORT.md (no secrets in it).

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
load_env

EXPORT_DIR="${1:-${EXPORT_DIR:?pass the export dir}}"
OUT_DIR="${2:-$EXPORT_DIR}"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/VALIDATION-REPORT.md"

info "Fingerprinting source (read-only)"
ssql -Atf "$PKG_DIR/04_validation.sql" | sort > "$OUT_DIR/source-counts.txt"
info "Fingerprinting target"
tsql -Atf "$PKG_DIR/04_validation.sql" | sort > "$OUT_DIR/target-counts.txt"

# One-off checks that are not part of the fingerprint file.
extra() { # <label> <sql>
  local s t
  s="$(ssqlq -c "$2" 2>/dev/null || echo ERR)"
  t="$(tsqlq -c "$2" 2>/dev/null || echo ERR)"
  printf '| %s | %s | %s | %s |\n' "$1" "$s" "$t" "$([[ "$s" == "$t" ]] && echo PASS || echo FAIL)"
}

{
  echo "# KudiTrack — Source vs Target Validation Report"
  echo
  echo "Generated: $(date -u '+%Y-%m-%d %H:%M UTC')  ·  Target project: \`$DST_REF\`"
  echo
  echo "Source = Lovable Cloud production, read-only throughout this migration."
  echo "No secrets appear in this file."
  echo
  echo "## 1. Critical entity comparison"
  echo
  echo "| Check | Source | Target | Result |"
  echo "|---|---|---|---|"
  extra "Auth users"                 "select count(*) from auth.users"
  extra "Auth user UUID digest"      "select md5(string_agg(id::text,',' order by id)) from auth.users"
  extra "Auth identities"            "select count(*) from auth.identities"
  extra "Google identities"          "select count(*) from auth.identities where provider='google'"
  extra "Identity provider_id digest" "select md5(string_agg(provider||':'||provider_id,',' order by provider,provider_id)) from auth.identities"
  extra "Password hashes intact"     "select md5(string_agg(encrypted_password,',' order by id)) from auth.users where encrypted_password is not null and encrypted_password<>''"
  extra "Email confirmations"        "select count(*) from auth.users where email_confirmed_at is not null"
  extra "Businesses (profiles)"      "select count(*) from public.profiles"
  extra "Profile id digest"          "select md5(string_agg(id::text,',' order by id)) from public.profiles"
  extra "Products"                   "select count(*) from public.products"
  extra "Product stock sum"          "select coalesce(sum(stock),0)::text from public.products"
  extra "Customers"                  "select count(*) from public.customers"
  extra "Sales"                      "select count(*) from public.sales"
  extra "Sales total sum"            "select coalesce(sum(total),0)::text from public.sales"
  extra "Sales paid sum"             "select coalesce(sum(amount_paid),0)::text from public.sales"
  extra "Sale items"                 "select count(*) from public.sale_items"
  extra "Sale item line total sum"   "select coalesce(sum(line_total),0)::text from public.sale_items"
  extra "Expenses"                   "select count(*) from public.expenses"
  extra "Expenses sum"               "select coalesce(sum(amount),0)::text from public.expenses"
  extra "Other income"               "select count(*) from public.other_income"
  extra "Other income sum"           "select coalesce(sum(amount),0)::text from public.other_income"
  extra "Restocks (inventory in)"    "select count(*) from public.restocks"
  extra "Stock movements"            "select count(*) from public.stock_movements"
  extra "Stock movement net"         "select coalesce(sum(change),0)::text from public.stock_movements"
  extra "Orders"                     "select count(*) from public.orders"
  extra "Order items"                "select count(*) from public.order_items"
  extra "Savings"                    "select count(*) from public.savings"
  extra "Investments"                "select count(*) from public.investments"
  extra "Subscription payments"      "select count(*) from public.subscription_payments"
  extra "Audit log"                  "select count(*) from public.audit_log"
  extra "Email audit log"            "select count(*) from public.email_audit_log"
  extra "Storage buckets"            "select count(*) from storage.buckets"
  extra "Storage objects"            "select count(*) from storage.objects"
  extra "Storage path digest"        "select md5(string_agg(bucket_id||'/'||name,',' order by bucket_id,name)) from storage.objects"
  extra "RLS policies (public)"      "select count(*) from pg_policies where schemaname='public'"
  extra "RLS-enabled tables"         "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity"
  extra "Functions (public)"         "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
  extra "Triggers (public)"          "select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal"
  extra "Indexes (public)"           "select count(*) from pg_indexes where schemaname='public'"
  extra "Enum types"                 "select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'"
  extra "Realtime tables"            "select count(*) from pg_publication_tables where pubname='supabase_realtime'"
  extra "Cron jobs"                  "select coalesce((select count(*)::text from cron.job),'0')"
  echo
  echo "## 2. Full fingerprint diff (per-table counts, checksums, orphan checks)"
  echo
  if diff -u "$OUT_DIR/source-counts.txt" "$OUT_DIR/target-counts.txt" > "$OUT_DIR/fingerprint.diff"; then
    echo '**IDENTICAL** — every table count and checksum in `04_validation.sql` matches.'
  else
    echo 'Differences found (expected for `cron.jobs` only, which is target-side):'
    echo
    echo '```diff'
    cat "$OUT_DIR/fingerprint.diff"
    echo '```'
  fi
  echo
  echo "## 3. Integrity checks on the target"
  echo
  echo '```'
  tsqlq -c "select 'orphan sale_items -> sales: '||count(*) from public.sale_items si left join public.sales s on s.id=si.sale_id where s.id is null"
  tsqlq -c "select 'orphan order_items -> orders: '||count(*) from public.order_items oi left join public.orders o on o.id=oi.order_id where o.id is null"
  tsqlq -c "select 'profiles without auth user: '||count(*) from public.profiles p left join auth.users u on u.id=p.id where u.id is null"
  tsqlq -c "select 'RLS-enabled tables with zero policies: '||count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and not exists (select 1 from pg_policies pp where pp.schemaname='public' and pp.tablename=c.relname)"
  tsqlq -c "select 'public tables missing a grant: '||count(*) from information_schema.tables t where t.table_schema='public' and t.table_type='BASE TABLE' and not exists (select 1 from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=t.table_name and g.grantee in ('anon','authenticated','service_role'))"
  tsqlq -c "select 'disabled triggers: '||count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and t.tgenabled<>'O'"
  echo '```'
  echo
  echo "All four counters above must read 0."
  echo
  echo "## 4. Verdict"
  echo
  echo "A migration is GREEN when section 1 shows no FAIL, section 2 differs only in \`cron.jobs\`, and section 3 is all zeros."
  echo "Anything else: do **not** connect staging. See ROLLBACK.md, reset the target, and re-run."
} > "$REPORT"

ok "report written: $REPORT"
grep -c '| FAIL |' "$REPORT" >/dev/null 2>&1 || true
if grep -q '| FAIL |' "$REPORT"; then
  warn "$(grep -c '| FAIL |' "$REPORT") comparison(s) FAILED — open the report."
  exit 1
fi
ok "all comparisons passed"
