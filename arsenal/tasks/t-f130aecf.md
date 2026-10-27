---
id: t-f130aecf
title: "A logo, app icons from it, and a README hero image"
label: "logo and README hero"
priority: 5
requires: [access:human]
tags: [DOCS]
---

Draw a simple SVG mark (`logo.svg` at the repo root) for Glossmark (for example a page with a gloss highlight), generate every icon Tauri's bundle lists from it (`npm run tauri icon`), and add a README hero screenshot of a document open in the app (D-23, status/ideas.md I-38). The owner approves the look in the PR before it merges.

## Acceptance gate

```bash
test -s logo.svg && [ "$(sha256sum src-tauri/icons/icon.png | cut -c1-64)" != 48f9185a7b6fd28a7ef17f7458d8e5c34bce552751a3242f45e28e93f4b85eed ] && grep -qE "!\[[^]]*\]\([^)]*hero" README.md
```
