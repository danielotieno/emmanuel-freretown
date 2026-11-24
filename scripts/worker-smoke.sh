#!/usr/bin/env bash
# Smoke-tests the built Worker in workerd, the runtime production uses. Playwright runs on
# `next start` (Node), which can hide Worker-only bugs such as the OpenNext Node-middleware
# crash on requests with cookies. Run after `opennextjs-cloudflare build`.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${SMOKE_PORT:-8799}"
BASE="http://127.0.0.1:${PORT}"
LOG="$(mktemp)"

pnpm exec wrangler dev --port "$PORT" --ip 127.0.0.1 >"$LOG" 2>&1 &
WRANGLER_PID=$!
trap 'kill "$WRANGLER_PID" 2>/dev/null || true; rm -f "$LOG"' EXIT

started=0
for _ in $(seq 1 60); do
  curl -s -o /dev/null "$BASE/" && { started=1; break; }
  sleep 1
done

if [[ "$started" -ne 1 ]]; then
  echo "FAIL the Worker did not start within 60 seconds. wrangler said:"
  cat "$LOG"
  exit 1
fi

fail=0
check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "ok   $name"
  else
    echo "FAIL $name: expected '$expected', got '$actual'"
    fail=1
  fi
}

check "public page renders" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
check "Kiswahili by default" '<html lang="sw"' "$(curl -s "$BASE/")"
check "saved language cookie" '<html lang="en"' "$(curl -s -H 'Cookie: PARAGLIDE_LOCALE=en' "$BASE/")"
check "CSP header" "script-src 'self' 'nonce-" "$(curl -s -D - -o /dev/null "$BASE/")"
check "no /admin on public host" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin")"
check "admin host serves staff area" "Staff area" \
  "$(curl -s --resolve "admin.localhost:${PORT}:127.0.0.1" "http://admin.localhost:${PORT}/")"

if grep -q "wrangler:error" "$LOG"; then
  echo "FAIL worker logged errors:"
  grep -A5 "wrangler:error" "$LOG"
  fail=1
fi

exit "$fail"
