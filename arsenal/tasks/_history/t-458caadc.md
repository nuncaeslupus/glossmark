---
id: t-458caadc
title: "T9: Signature theme"
label: "Signature theme"
priority: 1
deps: [t-a9b25b23, t-c8683796]
tags: [S-1]
status: merged
---

Signature theme: paper sheet on grey canvas, typography, light and dark, bundled fonts, user CSS loaded last

## Location
themes

## Tests
`test_currentcolor_svg_follows_theme_light_and_dark` in `e2e/theme.spec.ts` — the fixture SVG's computed fill equals the body text colour in both themes; `test_body_text_contrast_at_least_aa` — contrast ≥ 4.5 in both themes

## Acceptance gate
Metric: `themed_svg_fill_matches_text_colour == true` (from `status/plan.md`).

```bash
# themed_svg_fill_matches_text_colour == true: the fixture's currentColor SVG takes the body text
# colour in light and dark (System and View › Theme), and body text keeps AA contrast in both.
npm run build && npm exec -- vitest run src/themes && npm exec -- playwright test e2e/theme.spec.ts
```
