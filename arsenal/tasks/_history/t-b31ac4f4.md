---
id: t-b31ac4f4
title: "T3: Updater"
label: "updater"
priority: 5
deps: [t-8f5ad4b0]
tags: [PACKAGING]
workspace: packaging
status: merged
---

Updater (D-28, D-31): `tauri-plugin-updater` with the public key and the `latest.json` endpoint, and the signing key in secrets. `updater::enabled()` is false under `FLATPAK_ID`, `SNAP` or an executable below `/usr`. A check after first paint emits `update-available`, and More shows "Restart to update to x.y.z"

Plan: `arsenal/project/packaging/plan.md` T3; spec `arsenal/project/packaging/spec.md` (contracts §5, risks §6).

## Acceptance gate

Gate: `updater_tests_failed == 0`.

```bash
(cd src-tauri && cargo test updater) && npx vitest run src/ui/shell.test.ts -t "update item"
```

## Tests

`test_updater_is_off_in_flatpak_snap_and_usr` in `src-tauri/src/updater.rs` — `enabled()` is false for each of the three and true for an AppImage path; `test_update_item_appears_only_when_available` in `src/ui/shell.test.ts` — More has no update item until the event arrives

## Location

src-tauri, src
