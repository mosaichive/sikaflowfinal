#!/usr/bin/env bash
# KudiTrack — deploy edge functions and set their secrets on the TARGET project.
# Uses the Supabase CLI with SUPABASE_ACCESS_TOKEN from .env. Secrets are passed
# to the CLI via a temporary file with mode 600 that is deleted on exit; nothing
# is echoed and nothing is written into a tracked file.

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
load_env
require_vars DST_REF
[[ "$DST_REF" == "$PROD_REF" ]] && die "refusing: DST_REF is the Lovable Cloud production project"

need_bin supabase "npm i -g supabase"
[[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]] || die "SUPABASE_ACCESS_TOKEN missing — create one at https://supabase.com/dashboard/account/tokens"
export SUPABASE_ACCESS_TOKEN

FUNCS_DIR="$(cd "$PKG_DIR/../functions" && pwd)"
[[ -d "$FUNCS_DIR" ]] || die "supabase/functions not found at $FUNCS_DIR"

info "Deploying edge functions to $DST_REF"
mapfile -t fns < <(find "$FUNCS_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '_shared' -printf '%f\n' | sort)
((${#fns[@]})) || die "no functions found"
say "  ${#fns[@]} functions: ${fns[*]}"

# verify_jwt=false functions, mirroring supabase/config.toml
NO_JWT=" paystack-webhook resolve-phone-login submit-public-order confirm-order-receipt email-track-open email-track-click email-unsubscribe admin-email-send-campaign admin-monthly-statements exchange-rates "

for fn in "${fns[@]}"; do
  extra=()
  [[ "$NO_JWT" == *" $fn "* ]] && extra+=(--no-verify-jwt)
  if ( cd "$PKG_DIR/../.." && supabase functions deploy "$fn" --project-ref "$DST_REF" "${extra[@]}" >/dev/null 2>&1 ); then
    ok "deployed $fn${extra[*]:+ (public)}"
  else
    warn "deploy failed: $fn — retry with: supabase functions deploy $fn --project-ref \$DST_REF"
  fi
done

info "Setting function secrets"
tmp="$(mktemp)"; chmod 600 "$tmp"; trap 'rm -f "$tmp"' EXIT
for v in RESEND_API_KEY EMAIL_TRANSPORT SENDER_DOMAIN PUBLIC_APP_URL APP_PUBLIC_URL \
         STATEMENTS_CRON_SECRET PAYSTACK_SECRET_KEY AT_USERNAME AT_API_KEY AT_SENDER_ID \
         AT_ALLOW_SANDBOX SMS_ENABLED SUPER_ADMIN_SMS_PHONE TWILIO_ACCOUNT_SID \
         TWILIO_AUTH_TOKEN TWILIO_WHATSAPP_FROM AI_PROVIDER; do
  [[ -n "${!v:-}" ]] && printf '%s=%s\n' "$v" "${!v}" >> "$tmp"
done
if [[ -s "$tmp" ]]; then
  say "  setting $(wc -l < "$tmp") secrets (names only): $(cut -d= -f1 "$tmp" | tr '\n' ' ')"
  supabase secrets set --env-file "$tmp" --project-ref "$DST_REF" >/dev/null \
    && ok "secrets set" || warn "secrets command failed — set them in the dashboard instead"
else
  warn "no secrets configured in .env — email/SMS/Paystack will be inactive"
fi
rm -f "$tmp"

say
say "Not set by this script (do these in the new project's dashboard):"
say "  • Auth → URL configuration: Site URL + redirect allow-list"
say "  • Auth → Providers → Google: paste the EXISTING client ID/secret (never a new one)"
say "  • Auth → Email templates, confirmations ON, auto-confirm OFF, anonymous OFF"
say "  • Storage → per-bucket size limits and MIME allow-lists"
