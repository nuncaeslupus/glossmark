# Session Handover

<!-- Written at session end. A new session reading this file can resume without
     additional context. -->

## Last session (cloud, overnight 2026-10-27)

Merged, one PR per task, each with a pre-PR adversarial review:
T5 sanitiser (#22), T3 GFM (#23), T7 Rust core (#24), T4 extras + fixture (#25),
T11 window shell (#26), T16 Linux packaging (#27), T6 enhancers + Playwright/WebKit CI (#28),
T12 navigation (#29), T14 live reload (#30), T8 images (`image:` protocol) (#31),
T13 reading tools (#32), T9 signature theme (#33), T10 print (see its PR).

## What remains

- **T15 Performance (t-655476f0)**: implemented (worker parse, chunked render, Mermaid one per
  frame) but its gate honestly fails: 1 MB + 20 Mermaid renders in ~2.4 s vs the spec's
  1500 ms (`render_ms_1MB`, "all Mermaid included"). 1 MB without diagrams ≈ 0.7–1.2 s.
  Needs the owner's call: relax the spec (exclude Mermaid / higher bound for diagrams) or
  draw diagrams lazily. Its PR carries the work; do not merge until decided.
- **T17 Acceptance (t-b222ec6c)**: blocked on T15. Includes owner sign-offs (print parity,
  theme vs GitHub) and a fresh-VM .deb install.

## Open questions for the owner

1. T15 budget with Mermaid (above).
2. T7 scope reach: opening a file makes every `.md` under its folder (recursively) readable,
   and recent files re-grant that at launch. Keep, or limit to the file's own folder?

## Gotchas

- Global `push.negotiate=true` makes pushes fail with "missing necessary objects": use
  `git -c push.negotiate=false push`.
- Force-push is denied; after a squash-merge, restart the branch from `origin/main` and
  `git merge -s ours origin/<branch>` the stale history before pushing.
- The adversarial-review receipt is bound to the whole tree, so a moved base invalidates it;
  after two rounds, PRs were opened by hand (archive task file + `Closes #N`).
- `merge_ready.sh` can report green before the `check` job exists; confirm the `check`,
  `e2e` and `package` runs on the head SHA.
- The CI apt mirror can stall until the 20-minute step timeout; re-run once.
- Parallel worktree agents each build `src-tauri/target` (3–6 GB): share
  `CARGO_TARGET_DIR=/home/user/glossmark/src-tauri/target`.
- Playwright WebKit is not installable in the cloud container; CI's `e2e` job runs it.

## How to continue

1. Read `claude-arsenal/references/worker-loop.md`.
2. `python3 claude-arsenal/scripts/task_select.py --issues <issues.json>`.
