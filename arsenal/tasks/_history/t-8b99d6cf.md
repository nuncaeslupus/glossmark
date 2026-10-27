---
id: t-8b99d6cf
title: "Zoom and pan controls on Mermaid diagrams"
label: "mermaid zoom and pan"
priority: 5
tags: [PARITY]
status: merged
---

GitHub shows zoom and pan controls on Mermaid diagrams; Glossmark has none. (Owner's GitHub parity review during T17, status/ideas.md I-33.)

## Acceptance gate

```bash
npm run build && npm exec -- playwright test e2e/parity.spec.ts --project=webkit -g "mermaid diagram zooms and pans"
```
