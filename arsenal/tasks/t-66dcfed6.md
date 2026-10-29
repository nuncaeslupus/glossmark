---
id: t-66dcfed6
title: "T14: Rename to Nacho Viewer"
label: "rename to Nacho Viewer"
priority: 5
deps: []
tags: [PACKAGING]
workspace: packaging
---

Rename the app from Glossmark to **Nacho Viewer** (short name Nacho) before the first public release (D-32). It covers the product name, window title, `identifier` (`io.github.nuncaeslupus.NachoViewer`; Flathub discourages hyphens in app IDs), package and binary names (`nacho-viewer`; the bare `nacho` is taken on npm, crates.io and PyPI), the desktop file and MIME registration, the updater URL, the release workflow, the README, strings, the logo/icons (a single tortilla-chip mark) and the packaging plan. Settings move to a `nacho-viewer` folder; on first start the old `glossmark` folder is read when the new one is missing (recent files, theme, zoom, user.css). The owner renames the GitHub repo (GitHub redirects the old URL).

## Acceptance gate

Gate: `old_name_in_shipped_files == 0` and the config fallback test passes.

```bash
set -e
paths=(src src-tauri README.md package.json index.html .github/workflows)
# config.rs keeps the old folder name on purpose: it is the fallback this task adds.
rc=0; git grep -qi glossmark -- "${paths[@]}" ':!src-tauri/src/config.rs' || rc=$?
[ "$rc" -eq 1 ] || { echo "old name still in shipped files (git grep exit $rc)"; exit 1; }
if git ls-files -- "${paths[@]}" | grep -qi glossmark; then echo "old name in a file name"; exit 1; fi
grep -q 'fn test_config_falls_back_to_glossmark_folder' src-tauri/src/config.rs
(cd src-tauri && cargo test test_config_falls_back_to_glossmark_folder -- --exact)
npm test
```

## Tests

`test_config_falls_back_to_glossmark_folder` in `src-tauri/src/config.rs`: with only the old folder present, settings and user.css are read from it; with both present, the new one wins.

## Location

src-tauri, src, .github/workflows
