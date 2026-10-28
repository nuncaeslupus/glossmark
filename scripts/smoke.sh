#!/usr/bin/env bash
# Install smoke check (S-4 T2): launch the installed app and require it to still run after 10 s.
#
#   scripts/smoke.sh <app> [args...]   # prints install_smoke_failures=<0|1>; exits 1 on failure
#
# SMOKE_SECONDS overrides the 10 s wait (the tests use 1-2 s).
set -uo pipefail

seconds=${SMOKE_SECONDS:-10}
"$@" &
pid=$!
sleep "$seconds"
if kill -0 "$pid" 2>/dev/null; then
  kill "$pid" 2>/dev/null || true
  echo "install_smoke_failures=0"
  exit 0
fi
wait "$pid"
echo "::error::$1 exited with status $? before ${seconds}s"
echo "install_smoke_failures=1"
exit 1
