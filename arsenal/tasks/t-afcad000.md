---
id: t-afcad000
title: "Copy button: GitHub's icon, always visible"
label: "GitHub-style copy button"
priority: 10
tags: [PARITY]
---

Use GitHub's two-squares copy icon (Octicons copy) on code blocks, and show the button always rather than on hover. (Owner's GitHub parity review during T17, status/ideas.md I-35.)

## Acceptance gate

```bash
npm run build && npm exec -- playwright test e2e/parity.spec.ts --project=webkit -g "copy button is always visible with the copy icon"
```
