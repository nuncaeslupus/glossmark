# Session Handover

<!-- Written at session end. A new session reading this file can resume without
     additional context. -->

## This session (local, 2026-10-27)

- **T18 WebKit render freeze (t-1c0e5a17, #36)** → merged as #38. WebKit perf is asserted
  at WebKit-specific budgets above the measured floor (owner's call).
- **Watcher self-trigger loop** (tab clicks looked dead) → fixed in #40: watch.rs emits only
  when the file's mtime changes.
- **T17 Acceptance (t-b222ec6c, #18)** → merged as #50. `scripts/measure.sh` writes
  `status/acceptance.json` (first paint 648 ms, idle RSS 412 MB). Owner signed off four
  deviations, all in the status/plan.md Evidence log: first paint (gate at a 900 ms floor),
  idle RSS (WebKitGTK floor), GitHub parity (gaps queued), VM test on Ubuntu 26.04.1
  instead of 24.04 (local .deb needs glibc 2.43). Simplicity signed off.
- **CI flake**: the e2e Playwright install times out on a slow apt mirror → PR #51
  (session "Stop CI e2e timing out on Playwright install"), waiting on CI.

## What remains

- **PARITY gaps** #41–#48 (tag PARITY, gates in `e2e/parity.spec.ts`).
- **Faster start-up** (t-c86fe6e8, #49): first paint under 500 ms.
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
- GitHub auto-merge is disabled for this repo; merge by hand once `merge_ready.sh` is READY.

## How to continue

1. Read `claude-arsenal/references/worker-loop.md`.
2. `python3 claude-arsenal/scripts/task_select.py --issues <issues.json>`.
