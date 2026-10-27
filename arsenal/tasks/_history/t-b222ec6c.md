---
id: t-b222ec6c
title: "T17: Acceptance"
label: "Acceptance"
priority: 5
deps: [t-ef401013, t-c6fde259, t-95e61751, t-64d25a50, t-655476f0, t-4bca9c6c]
tags: [S-1]
status: merged
---

Acceptance on the reference machine and a fresh Ubuntu 24.04 VM: first paint, idle RSS, install and double-click, owner's review of simplicity and GitHub parity (fixture + three READMEs)

## Location
repo

## Tests
`scripts/measure.sh` records `first_paint_ms_100KB` and `idle_rss_mb` (≤ 250 with three 100 KB tabs); owner sign-off recorded in the Evidence log

## Acceptance gate
Metric: `first_paint_ms_100KB <= 500` (from `status/plan.md`).

```bash
# arsenal:gate-placeholder — replace with the real check; it may land in this task's own PR
false
```
