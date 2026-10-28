# Session Handover

<!-- Written at session end. A new session reading this file can resume without
     additional context. -->

## This session (local, 2026-10-28)

- **#49 start-up** closed at the ~650 ms WebKitGTK floor (owner-accepted deviation); perf
  bounds loosened for CI (#65).
- **Ideas I-24..I-29, I-38** explored → D-18..D-23, queued (#71) and all merged:
  Find/Print Material icons (#72), Ctrl+Tab (#73), logo + icons + README hero (#74, owner
  approved), one bar in three zones with ⋮ More (#75; owner: Print and ⋮ at the right edge,
  Find in the centre next to zoom), Export PDF (#76).
- Queue empty.

## What remains

- README hero (`docs/hero.png`) shows the old toolbar; retake it to show the new bar.
- Export to PDF is Linux-only; Windows/macOS return an error (D-4).

## Decisions taken

- D-19 as built: left ☰ title ←→ · centre − % + Find · right Export Print ⋮.
- Export: the Save dialog runs in Rust; `export_pdf` writes only that dialog's last answer.
- PR review (owner, 2026-10-28): ask `@coderabbitai review`; if CodeRabbit still does not
  review, review the PR ourselves, then merge when green.

## Gotchas

- GTK's file printer is named in the desktop's language: `glib::dgettext("gtk30", "Print to File")`.
- No xdotool on this Wayland desktop: verify native flows with a temporary, uncommitted hook in
  `main.rs` + `npm run tauri dev -- -- -- <file>`.
- `open_task_pr.sh` from a spawned worktree session can push only the task archive (#74 did):
  check `gh pr diff N --name-only` before trusting a worker's PR.
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
