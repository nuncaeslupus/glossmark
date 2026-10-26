---
id: t-c6fde259
title: "T12: Navigation"
label: "Navigation"
priority: 5
deps: [t-36c4c149]
tags: [S-1]
---

Navigation: per-tab back/forward, `.md` links in place, Ctrl/middle-click new tab, `#anchors`, wiki-link resolution, external links to the OS

## Location
frontend

## Tests
`test_link_routing_table_all_cases` in `src/ui/links.test.ts` — each (link kind, modifier) pair routes to the expected action; `test_history_back_after_two_links_returns_first`

## Acceptance gate
Metric: `link_routing_cases_failed == 0` (from `status/plan.md`).

```bash
# arsenal:gate-placeholder — replace with the real check; it may land in this task's own PR
false
```
