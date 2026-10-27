# Session Handover

<!-- Written at session end. A new session reading this file can resume without
     additional context. -->

## This session (local, 2026-10-27, second half)

- **CI e2e** now runs in the Playwright container (#51).
- **#50's squash dropped T17 work** → landed in #53.
- **All eight PARITY gaps merged**: heading anchors (#54), img height (#55), sans-serif body
  (#56), gantt width (#57), Git Issues chart size (#58), front matter rows (#59), copy
  button (#60), Mermaid zoom/pan (#61, no pan arrows or fullscreen, D-11).
- **Faster start-up** (t-c86fe6e8, #49) — claimed, **blocked on the owner**. 500 ms is out
  of reach on WebKitGTK: ~335 ms of GTK/webview/web-process start-up runs before any app
  code, and launch-to-read is ~490 alone (+~170 render). Breakdown and the four cuts tried
  (none beat noise) are in the #49 comment and `tmp/t-c86fe6e8-notes.md`. Owner to rule:
  accept a ~650 floor as a deviation, or re-scope. No PR.

## What remains

- #49 owner ruling (above).
- Ideas I-24..I-29 and I-38 (logo + README hero image) in status/ideas.md, not queued.

## Decisions taken

- Mermaid is drawn lazily as it nears the view (D-16); T7 scope stays recursive (D-17).
- WebKit perf budgets (T18) and first paint (T17) are gated at a floor above the measured
  value — regression guards, looser than the spec metric (owner's calls).
- First paint = launch-to-read (inotify OPEN on the doc) + WebKit render_ms_100KB.
- Render boxes are 16 KB (`CHUNK_CHARS`).

## Gotchas

- The shell is zsh: a variable holding newline-separated paths is ONE argv; list paths.
- `gh pr edit` fails (Projects classic GraphQL); use
  `gh api -X PATCH repos/nuncaeslupus/glossmark/pulls/N -F body=@file`.
- `merge_ready.sh` (bundle 5.14.0) hits E2BIG on PRs with large patches — not yet reported
  upstream. It can also report green before the `check` job exists.
- Playwright WebKit may vanish locally; `npx playwright install webkit`.
- Plain `cargo build --release` has no embedded frontend; use `npm run tauri build`.
- Global `push.negotiate=true` makes pushes fail: `git -c push.negotiate=false push`.
- Any edit after an adversarial-review verdict invalidates the receipt.
- e2e perf `render_ms_1MB` (chromium, ≤ 1500) flakes on CI at ~1550–1710: `gh run rerun <id> --failed`.
  A budget change is the owner's call.
- Parity PRs all append to the end of `e2e/parity.spec.ts`: rebasing one on another conflicts;
  keep both tests.
- `open_task_pr.sh` commits the whole uncommitted tree; run it from a clean tree.
- Gates needing the env (npm, display) need `ARSENAL_GATE_INHERIT_ENV=1`.
- `mcp__ccd_pr__bind_pr` takes `url`, not `pr_number`.
- GitHub auto-merge is disabled for this repo; merge by hand once `merge_ready.sh` is READY.

## How to continue

1. Read `claude-arsenal/references/worker-loop.md`.
2. `python3 claude-arsenal/scripts/task_select.py --issues <issues.json>`.
