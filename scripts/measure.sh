#!/usr/bin/env bash
# Acceptance measurements (T17): first_paint_ms_100KB and idle_rss_mb.
#
#   scripts/measure.sh              # both; writes status/acceptance.json
#   scripts/measure.sh first-paint  # just first paint (needs a display + release binary)
#   scripts/measure.sh idle-rss     # just idle RSS (needs a display + release binary)
#
# first_paint_ms_100KB is launch-to-document-read of the release binary plus the WebKit e2e
# render_ms_100KB of the same document (WebKitGTK is the real Tauri Linux engine).
# idle_rss_mb launches the built app with three 100 KB docs open as tabs and sums PSS across its process tree (PSS, so the
# shared library pages of WebKitGTK's several processes are not counted more than once).
set -euo pipefail
cd "$(dirname "$0")/.."

RESULTS="status/acceptance.json"
BIN="src-tauri/target/release/glossmark"

# Launch to the document being read: spawn the release binary on a 100 KB doc and time the
# first inotify OPEN of that file (process, GTK and WebKitGTK start-up, bundle load, IPC).
launch_to_read() {
  [ -x "$BIN" ] || { echo "no release binary ($BIN); run 'npm run tauri build'" >&2; return 1; }
  local dir ms
  dir=$(mktemp -d)
  node --input-type=module -e \
    "import {bigDocument} from '$PWD/e2e/big.ts'; process.stdout.write(bigDocument(102400))" \
    >"$dir/big.md"
  ms=$(python3 -I - "$BIN" "$dir/big.md" <<'PY'
import ctypes, os, select, subprocess, sys, time
libc = ctypes.CDLL("libc.so.6")
fd = libc.inotify_init1(os.O_NONBLOCK)
libc.inotify_add_watch(fd, sys.argv[2].encode(), 0x20)  # IN_OPEN
t0 = time.monotonic()
p = subprocess.Popen(sys.argv[1:3], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     start_new_session=True)
if select.select([fd], [], [], 20)[0]:
    print(round((time.monotonic() - t0) * 1000))
time.sleep(1)
os.killpg(p.pid, 15)
PY
)
  rm -rf "$dir"
  [ -n "$ms" ] || { echo "the app never opened the document" >&2; return 1; }
  echo "$ms"
}

# First paint = launch-to-read (median of three) + the WebKit render of the same 100 KB doc.
# The 100 KB perf test prints `[webkit] render_ms_100KB=NNN ...`; take that number.
first_paint() {
  local out render start
  out=$(npm exec -- playwright test e2e/perf.spec.ts --project=webkit \
        -g "render_100kb" 2>&1 | tee /dev/stderr) || true
  render=$(grep -oP '\[webkit\] render_ms_100KB=\K[0-9]+' <<<"$out" | tail -1)
  [ -n "$render" ] || { echo "no WebKit render_ms_100KB in the perf run" >&2; return 1; }
  start=$(for _ in 1 2 3; do launch_to_read; done | sort -n | sed -n 2p)
  [ -n "$start" ] || { echo "launch-to-read failed" >&2; return 1; }
  echo "launch_to_read_ms=$start render_ms_100KB=$render" >&2
  echo $((start + render))
}

# pid + every descendant, so the WebKitGTK web/network helper processes count too.
tree_pids() {
  local pid=$1 kids
  echo "$pid"
  kids=$(pgrep -P "$pid" 2>/dev/null || true)
  for k in $kids; do tree_pids "$k"; done
}

idle_rss() {
  [ -x "$BIN" ] || { echo "no release binary ($BIN); run 'npx tauri build'" >&2; return 1; }
  local dir total pid pss
  dir=$(mktemp -d)
  # Three representative 100 KB docs — the same prose-shaped document the perf harness
  # renders (bigDocument, no diagrams), not the feature fixture repeated into a wall of
  # Mermaid. node strips the types; big.ts imports nothing.
  for i in 1 2 3; do
    node --input-type=module -e \
      "import {bigDocument} from '$PWD/e2e/big.ts'; process.stdout.write(bigDocument(102400))" \
      >"$dir/doc$i.md"
  done
  setsid "$BIN" "$dir/doc1.md" "$dir/doc2.md" "$dir/doc3.md" >/dev/null 2>&1 &
  pid=$!
  sleep 8   # let all three tabs render and the webview go idle
  kill -0 "$pid" 2>/dev/null || { echo "app exited before it could be measured" >&2; return 1; }
  # PSS, not RSS: WebKitGTK runs several processes (UI, web, network, GPU) that map the
  # same GTK/Mesa/WebKit libraries; summed RSS counts those shared pages once per process.
  # PSS (from smaps_rollup) splits each shared page across its sharers, so the sum is the
  # app's true resident footprint.
  total=0
  for p in $(tree_pids "$pid"); do
    pss=$(awk '/^Pss:/{s+=$2} END{print s}' "/proc/$p/smaps_rollup" 2>/dev/null || true)
    [ -n "$pss" ] && total=$((total + pss))
  done
  kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  rm -rf "$dir"
  [ "$total" -gt 0 ] || { echo "no PSS readable for the app's processes" >&2; return 1; }
  echo $((total / 1024))   # KiB -> MiB
}

# A single-metric run keeps the other metric's recorded value.
prev() { python3 -c "import json; print(json.load(open('$RESULTS')).get('$1') or '')" 2>/dev/null || true; }
fp=$(prev first_paint_ms_100KB) rss=$(prev idle_rss_mb)
case "${1:-both}" in
  first-paint) fp=$(first_paint) ;;
  idle-rss)    rss=$(idle_rss) ;;
  both)        fp=$(first_paint); rss=$(idle_rss) ;;
  *) echo "usage: $0 [first-paint|idle-rss|both]" >&2; exit 2 ;;
esac

mkdir -p "$(dirname "$RESULTS")"
printf '{"first_paint_ms_100KB": %s, "idle_rss_mb": %s, "sha": "%s", "date": "%s"}\n' \
  "${fp:-null}" "${rss:-null}" "$(git rev-parse --short HEAD)" "$(date -Is)" >"$RESULTS"
echo "first_paint_ms_100KB=${fp:-?} idle_rss_mb=${rss:-?}  (ceilings: 500 ms, 250 MB)"
echo "recorded -> $RESULTS"
