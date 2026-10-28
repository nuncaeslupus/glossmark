---
id: t-8f5ad4b0
title: "T1: release"
label: "release workflow"
priority: 5
tags: [PACKAGING]
workspace: packaging
status: merged
---

`release.yml`: a `v*` tag builds .deb, AppImage, .msi, NSIS .exe and a universal ad-hoc-signed .dmg into a draft Release. It fails when the tag differs from `tauri.conf.json` or `Cargo.toml`, and reports each bundle's size. `scripts/check_release.sh <tag>` lists any missing asset. Proven on the tag `v0.1.0-rc.1`

Plan: `arsenal/project/packaging/plan.md` T1; spec `arsenal/project/packaging/spec.md` (contracts §5, risks §6).

## Acceptance gate

Gate: `release_assets_missing == 0`.

```bash
bash scripts/check_release.test.sh
```

## Tests

`test_release_tag_must_match_version` in `scripts/check_release.test.sh` — `check_release.sh --version-only v9.9.9` exits 1 when the config says 0.1.0

## Location

ci
