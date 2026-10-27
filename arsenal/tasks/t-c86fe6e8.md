---
id: t-c86fe6e8
title: "Bring first paint under 500 ms by shortening start-up"
label: "faster start-up"
priority: 5
tags: [PERF]
---

T17 measured first paint (launch `glossmark big.md` to the sheet visible, release build) at
about 676 ms against the spec's 500 ms: ~490 ms from launch to the document being read, then
~185 ms of WebKit render. The owner accepted it as a WebKitGTK start-up deviation and asked
for this task. Find where the ~490 ms goes (process and GTK start, WebKitGTK web process,
bundle load, the getConfig / readUserCss / listen round trips that `Shell.start` awaits before
`takeOpenFiles`) and cut what can be cut. Measure with `scripts/measure.sh first-paint` on
the reference machine and commit `status/acceptance.json`.

## Acceptance gate

```bash
python3 -c "import json,sys; v=json.load(open('status/acceptance.json'))['first_paint_ms_100KB']; print(f'first_paint_ms_100KB={v} (<= 500)'); sys.exit(0 if v is not None and v <= 500 else 1)"
```
