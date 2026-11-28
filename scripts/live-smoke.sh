#!/usr/bin/env bash
# Smoke-tests a deployed environment over the internet (issue #7). Run by the deploy workflow
# after every deploy; safe to run by hand at any time. It only reads public pages.
#
#   scripts/live-smoke.sh https://staging.ackemmanuelfreretown.org https://admin-staging.ackemmanuelfreretown.org
#
# The staff host must answer with a redirect to Cloudflare Access: that proves the staff portal
# is not reachable without the Access login.
set -euo pipefail

PUBLIC="${1:?usage: live-smoke.sh <public-url> <admin-url>}"
ADMIN="${2:?usage: live-smoke.sh <public-url> <admin-url>}"

# A brand-new custom domain can take a few minutes to get its certificate.
for attempt in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PUBLIC/" || true)"
  [[ "$code" == "200" ]] && break
  echo "waiting for $PUBLIC (attempt $attempt, got $code)"
  sleep 10
done

fail=0
# check <name> <expected> <actual>: passes when <actual> matches <expected>, an extended regular
# expression (unanchored, so plain text matches anywhere in it).
check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" =~ $expected ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected '$expected', got '${actual:0:200}'"
    fail=1
  fi
}

check "public page renders" '^200$' "$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC/")"
check "English by default (#80)" '<html lang="en"' "$(curl -s "$PUBLIC/")"
check "CSP header" "script-src 'self' 'nonce-" "$(curl -s -D - -o /dev/null "$PUBLIC/")"
# Plain http must redirect to https (zone setting "Always Use HTTPS"): 301 or 308.
check "http redirects to https" '^30[18]$' "$(curl -s -o /dev/null -w '%{http_code}' "${PUBLIC/https:/http:}/")"
check "no /admin on the public host" '^404$' "$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC/admin")"
check "staff host is behind Cloudflare Access" "cloudflareaccess.com" \
  "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$ADMIN/")"

exit "$fail"
