---
id: t-a1ef9b1d
title: "T3: GFM extensions"
label: "GFM extensions"
priority: 5
deps: [t-befb1a9f]
tags: [S-1]
---

GFM: tables, task lists, strikethrough, extended autolinks, tag filter

## Location
frontend

## Tests
`test_gfm_extension_examples_all_match` in `src/render/gfm.test.ts` — every example in the GFM spec's extension sections matches

## Acceptance gate
Metric: `gfm_extension_examples_pass_rate == 1.0` (from `status/plan.md`).

```bash
# arsenal:gate-placeholder — replace with the real check; it may land in this task's own PR
false
```
