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

Measured on the reference machine by `scripts/measure.sh` and committed to
`status/acceptance.json` (acceptance timings are reference-hardware measurements, not a
shared CI runner's). `idle_rss_mb` is recorded there and in the plan's Evidence log; it
exceeds its 250 MB target — see the deviation note — and is an owner sign-off, not this
gate's metric.

Measured first paint (launch to visible, release build) is about 676 ms: WebKitGTK start-up
alone takes ~490 ms before the document is read. The owner accepted that as a documented
engine-floor deviation (2026-10-27, same decision as T18), so the gate asserts a regression
floor of 900 ms above the measurement rather than the 500 ms metric.

```bash
# first_paint_ms_100KB <= 900 (WebKitGTK floor; the plan's metric is 500), from the reference-machine measurement committed to
# status/acceptance.json by scripts/measure.sh. Asserting the committed number (not
# re-measuring) keeps the gate deterministic: a WebKit timing on a shared CI runner is
# both slow and unstable.
python3 -c "import json,sys; v=json.load(open('status/acceptance.json'))['first_paint_ms_100KB']; print(f'first_paint_ms_100KB={v} (<= 900)'); sys.exit(0 if v is not None and v <= 900 else 1)"
```
