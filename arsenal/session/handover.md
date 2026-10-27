# Session Handover

<!-- Written at session end. A new session reading this file can resume without
     additional context. -->

## This session (local, 2026-10-27)

- **T18 WebKit render freeze (t-1c0e5a17, #36)** → PR #38, open, CI running. Profiled on
  WebKitGTK: the chunked render is sliced correctly; the unsliceable freeze is Mermaid's
  **first `m.render()`** — a ~0.6 s cold JSC compile of its lazy chunks (dagre, elk, rough)
  that no slicing breaks up — and a 1 MB layout alone is ~2 s. So the 1500/200 ms metric is
  not reachable on WebKit. **Owner's call (Option A)**: assert WebKit-specific budgets above
  the measured floor as a regression guard, deliberately looser than the metric the gate
  still names. `e2e/perf.spec.ts` now asserts (not reports) per-project bounds; the
  `WEBKIT_BUDGETS` env branch is gone (gate still passes it, now a no-op). Gate: 5 passed.

## Last session (cloud, overnight 2026-10-27)

Merged, one PR per task, each with a pre-PR adversarial review:
T5 sanitiser (#22), T3 GFM (#23), T7 Rust core (#24), T4 extras + fixture (#25),
T11 window shell (#26), T16 Linux packaging (#27), T6 enhancers + Playwright/WebKit CI (#28),
T12 navigation (#29), T14 live reload (#30), T8 images (`image:` protocol) (#31),
T13 reading tools (#32), T9 signature theme (#33), T10 print (#34), T15 performance (#35).

## What remains

- **T17 Acceptance (t-b222ec6c, #18)**: needs the owner's computer: fresh-VM .deb install,
  sign-offs (print parity, theme vs GitHub).
- **T18 (t-1c0e5a17, #36)**: PR #38 open; merge once CI is green. This was the last open task.

## Decisions taken

- Mermaid is drawn lazily as it nears the view (D-16); T7 scope stays recursive (D-17).
- WebKit perf timings are asserted as of T18 (#38), at WebKit-specific budgets above the
  measured floor — a regression guard, looser than the 1500/200 ms metric (owner's call).
- Render boxes are 16 KB (`CHUNK_CHARS`): each box's first layout is the 1 MB render's
  longest task.

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
