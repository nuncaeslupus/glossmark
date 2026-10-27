---
id: t-3adc5dab
title: "Gantt charts at GitHub's height"
label: "gantt not squashed"
priority: 10
tags: [PARITY]
---

Mermaid Gantt charts render too compressed vertically compared with GitHub. (Owner's GitHub parity review during T17, status/ideas.md I-32.)

## Acceptance gate

```bash
npm run build && npm exec -- playwright test e2e/parity.spec.ts --project=webkit -g "gantt chart keeps its natural height"
```
