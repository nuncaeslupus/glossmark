---
id: t-befb1a9f
title: "T2: CommonMark pipeline"
label: "CommonMark pipeline"
priority: 5
deps: [t-724e3930]
tags: [S-1]
---

Render pipeline core: markdown-it with CommonMark settings, run the CommonMark spec suite

## Location
frontend

## Tests
`test_commonmark_spec_all_examples_match` in `src/render/commonmark.test.ts` — every example in spec.json renders to its expected HTML (normalised)

## Acceptance gate
Metric: `commonmark_spec_pass_rate == 1.0` (from `status/plan.md`).

```bash
# arsenal:gate-placeholder — replace with the real check; it may land in this task's own PR
false
```
