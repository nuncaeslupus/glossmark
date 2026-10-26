---
id: t-4bca9c6c
title: "T16: Linux packaging"
label: "Linux packaging"
priority: 5
deps: [t-c63c60f5]
tags: [S-1]
---

Linux packaging: `.desktop`, MIME association for `text/markdown`, icon, `.deb` and AppImage built in CI on every PR

## Location
repo

## Tests
`test_desktop_file_declares_markdown_mime` in `src-tauri/tests/desktop_file.rs`; CI step fails when the `.deb` exceeds 20 MB

## Acceptance gate
Metric: `deb_package_mb <= 20` (from `status/plan.md`).

```bash
# arsenal:gate-placeholder — replace with the real check; it may land in this task's own PR
false
```
