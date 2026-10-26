# Session Handover

<!-- Written at session end. A new session reading this file can resume without
     additional context. -->

## Last task

- **ID**: t-befb1a9f
- **Title**: T2: CommonMark pipeline
- **Status at handover**: done (PR #20, `Closes #3`)

## What was done this session

Spec (rev 3) and plan (rev 1) approved and merged (#1). T1 app shell, Makefile and CI
merged (#19). T2 `render()` on markdown-it `commonmark` mode passes all 652
commonmark-spec 0.31.2 examples (#20). Next by deps: T3 GFM (t-a1ef9b1d, #4) and
T5 sanitiser (t-cf825039, #5); both need only T2.

## What remains

- T3–T17 per `status/plan.md`; each task file still has the placeholder gate, which its own
  PR replaces with the real check (see T2's `npm exec -- vitest run …`).

## How to continue

1. Read `claude-arsenal/references/worker-loop.md` for the worker loop algorithm.
2. Run `python3 claude-arsenal/scripts/task_select.py --issues <issues.json>` for
   the next unblocked task.

Gotchas seen here:
- `open_task_pr.sh` refuses `git add -A` in a shared checkout; PRs #19/#20 were opened with
  `git push` + `gh pr create` and a `Closes #N` line instead.
- Its hardened gate env has no `npx` (use `npm exec --`) and no rustup default; run it with
  `ARSENAL_GATE_INHERIT_ENV=1` on a rustup-managed machine.
- Tauri 2.12 needs Rust ≥ 1.90. Without WebKitGTK dev headers the Makefile's Rust steps skip
  locally; CI always runs them.
- ubuntu-24.04 runners can hang on apt's man-db trigger; ci.yml disables it.
