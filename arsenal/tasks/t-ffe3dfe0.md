---
id: t-ffe3dfe0
title: "T6: README Install section"
label: "README install section"
priority: 10
tags: [PACKAGING]
workspace: packaging
---

README Install section: Releases per OS, the channel commands, and the unsigned-app steps ("More info › Run anyway"; "Privacy & Security › Open Anyway")

Plan: `arsenal/project/packaging/plan.md` T6; spec `arsenal/project/packaging/spec.md` (contracts §5, risks §6).

## Acceptance gate

Gate: `readme_install_sections == 3`.

```bash
grep -q '^## Install' README.md && for os in Linux Windows macOS; do grep -q "^### $os" README.md || exit 1; done
```

## Tests

`test_readme_names_each_os` in `scripts/check_release.test.sh` — README has an Install heading with Linux, Windows and macOS subsections

## Location

docs
