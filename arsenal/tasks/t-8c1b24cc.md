---
id: t-8c1b24cc
title: "T13: SignPath Foundation"
label: "SignPath signing"
priority: 10
deps: [t-04725ec9]
requires: [access:human]
tags: [PACKAGING]
workspace: packaging
---

SignPath Foundation: the owner applies with the public repo. Once approved, the Windows job signs the .msi and .exe

Plan: `arsenal/project/packaging/plan.md` T13; spec `arsenal/project/packaging/spec.md` (contracts §5, risks §6).

## Acceptance gate

Gate: `windows_bundles_signed == 2`.

```bash
bash scripts/check_release.sh --signed "$(git describe --tags --abbrev=0)"
```

## Tests

`test_windows_bundles_signed` in `scripts/check_release.sh` — `osslsigncode verify` passes on both downloaded Windows bundles

## Location

ci
