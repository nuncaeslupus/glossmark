#!/usr/bin/env bash
# Tests for scripts/smoke.sh. Stand-in commands play the installed app; SMOKE_SECONDS keeps them short.
set -euo pipefail
cd "$(dirname "$0")/.."

SCRIPT=scripts/smoke.sh
failures=0

fail() { echo "FAIL $1: $2"; failures=$((failures + 1)); }

test_smoke_fails_when_app_exits() {
  if out=$(SMOKE_SECONDS=2 bash "$SCRIPT" sleep 0.2 2>&1); then
    fail "${FUNCNAME[0]}" "exit 0 although the app exited: $out"
  fi
  grep -q '^install_smoke_failures=1$' <<<"$out" || fail "${FUNCNAME[0]}" "no failure count: $out"
}

test_smoke_passes_when_app_stays_up() {
  out=$(SMOKE_SECONDS=1 bash "$SCRIPT" sleep 30 2>&1) || fail "${FUNCNAME[0]}" "exit $?: $out"
  grep -q '^install_smoke_failures=0$' <<<"$out" || fail "${FUNCNAME[0]}" "no zero count: $out"
}

test_smoke_fails_when_app_is_missing() {
  if out=$(SMOKE_SECONDS=1 bash "$SCRIPT" ./no-such-app 2>&1); then
    fail "${FUNCNAME[0]}" "exit 0 for a missing binary: $out"
  fi
}

test_smoke_fails_when_app_exits
test_smoke_passes_when_app_stays_up
test_smoke_fails_when_app_is_missing

if [ "$failures" -gt 0 ]; then
  echo "$failures failure(s)"
  exit 1
fi
echo "smoke tests passed"
