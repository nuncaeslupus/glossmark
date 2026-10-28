# Glossmark — Specification (annotated edition)

> Generated 2026-10-28. This is the document with a **note slot** after every section that has text of its own. Read it in any Markdown app. To annotate, replace the `_(your notes…)_` placeholder under any section. When done, send the file back — notes are acted on.

---

# Spec

## Preamble & scope

**Date**: 2026-10-28
**Ticket / PR**: S-4 (status/ideas.md)
**Author**: Claude Opus 5.5, with the owner
**Revision**: 2
**Status**: approved (2026-10-28, revision 2) — without annotations
**Revision log**:
- r1 — first draft, from the explore-idea decisions D-10 and D-23 to D-30
- r2 — owner resolved the updater question in chat: D-31 supersedes D-28; approved without annotations

> Review record. Each round of reviewer notes makes a new revision: bump
> **Revision**, add a log line naming the export it applied
> (``- r2 — applied `<repo>-spec-v1-<date>-notes.md` ``), and commit that
> export beside this file in the same commit. On approval set
> **Status** to `approved (YYYY-MM-DD, revision N)` and, when the reviewer sent
> no notes for that revision, add `— without annotations`.

<!-- -->

> **✎ Notes** · `SPEC · intro`
> _(your notes here — replace this line)_

## §1 Problem statement

Glossmark builds only for Linux, and only inside CI's `package` job. The .deb and the AppImage
it makes are kept for seven days as an Actions artifact, and nobody outside the repository can
find them. Windows and macOS have no build at all. Export to PDF works only on Linux (D-20, D-4).
There is no version scheme, no release and no way to update. The owner wants a free app that
anyone on Linux, Windows or macOS can install from where they already look for software, and
that stays current. There is no paid signing and no Apple Developer program (D-24). This is a
planned improvement. Nothing is broken, but the viewer has no users until it ships.

**Ideas covered**: I-14 (packages for Linux, Windows and macOS). D-30 comes from the same
conversation but belongs to S-1; it is queued as its own task (t-6723dbe0) and is outside this
spec's plan.

**Success criteria (measurable)**

- [ ] `release_assets_missing == 0`. Pushing a tag `vX.Y.Z` creates a GitHub Release whose assets
      include a .deb and an .AppImage (x86_64), an .msi and an NSIS `-setup.exe` (x64), a
      universal .dmg, and the updater's `latest.json` with a `.sig` per updatable bundle.
- [ ] `release_workflow_minutes <= 60`, measured from the tag push to the published Release.
- [ ] `deb_package_mb <= 20` (unchanged). `msi_mb <= 20` and `dmg_mb <= 30`, reported in the
      job summary like the .deb.
- [ ] `install_smoke_failures == 0`. On each OS runner, the release workflow installs the bundle
      it built (the .deb with `apt`, the .msi with `msiexec /qn`, and the .dmg by copying the .app),
      launches it with a fixture file, and the process is still alive after 10 s.
- [ ] `channel_version_lag_hours <= 72` for winget, Homebrew tap, Snap and the apt repo: each
      channel serves the new tag within 72 h of the Release. Flathub's first submission is
      exempt, because Flathub reviews it by hand.
- [ ] Channel installs, judged once by the owner on a clean machine and recorded in the evidence
      log: `winget install nuncaeslupus.Glossmark`, `brew install --cask nuncaeslupus/tap/glossmark`,
      `flatpak install flathub io.github.nuncaeslupus.glossmark`, `snap install glossmark`, and
      `apt install glossmark` after adding the repo. Each one opens a .md file by double-click.
- [ ] Self-update, judged by the owner. An AppImage, an .msi install and a .dmg install of
      `vX.Y.Z` each offer `vX.Y.Z+1` within one minute of start, install it and restart into it.
      An update whose signature fails verification is refused (unit test on the verify path).
- [ ] `export_pdf_pages` on Windows and macOS equals the Linux page count ±1 for
      `e2e/fixtures` and the README fixture. The PDF is paginated (A4 or Letter pages), not one
      long page. Judged by the owner on one exported file per OS.
- [ ] `secrets_in_repo == 0`. The update-signing key, the apt GPG key and the store and tap
      tokens live only in GitHub Actions secrets. The gitleaks / GitGuardian check stays green.

<!-- -->

> **✎ Notes** · `SPEC §1`
> _(your notes here — replace this line)_

## §2 Systems & Impact

| System | Type | Role | Needs changes? | Impact | Severity |
|--------|------|------|----------------|--------|----------|
| `.github/workflows/release.yml` (new) | Infrastructure | Builds every OS on a tag, signs updater bundles, publishes the Release, then feeds each channel | Yes | New workflow. macOS and Windows runners are free on a public repository | High |
| `.github/workflows/ci.yml` `package` job | Infrastructure | PR-time Linux package and size gate | Validation only | Stays as the PR check. The release workflow reuses its size check | Low |
| `src-tauri/tauri.conf.json` | Primary | Bundle targets, icons, version, updater endpoint and public key | Yes | Adds `msi`, `nsis`, `dmg` and `app` targets, `icon.ico`/`icon.icns`, `createUpdaterArtifacts`, `plugins.updater` | Med |
| `src-tauri` (Rust) | Primary | Updater plugin; turns the updater off in sandboxed builds; Windows and macOS `print_to_pdf` | Yes | New dependency `tauri-plugin-updater`. `export.rs` gains two platform paths | High |
| `src/` (frontend) | UI | Shows "Update available, restart to install" quietly in the bar or the More menu | Yes | One notice, with its text in `src/strings.ts` (D-14). Must not make the window busier (D-11) | Low |
| `nuncaeslupus/homebrew-tap` (new repo) | Dependent | The `glossmark` cask, bumped by the release workflow | Yes | One more repository, and a token with write access to it | Low |
| `microsoft/winget-pkgs` | Dependent | The `nuncaeslupus.Glossmark` manifest, a PR per release (komac or wingetcreate) | Yes | Microsoft's validation pipeline merges the PR. The first one gets a human review | Low |
| `flathub/io.github.nuncaeslupus.glossmark` | Dependent | Flatpak manifest repackaging the released .deb, updated by Flathub's external-data checker | Yes | One-off submission PR to `flathub/flathub`. Flathub verifies the `io.github.nuncaeslupus` id against the GitHub account | Med |
| Snap Store `glossmark` | Dependent | `snap/snapcraft.yaml` repackaging the .deb, uploaded by the release workflow to `stable` | Yes | Strict confinement with `home` and `removable-media`. Files outside those cannot be opened | Med |
| apt repo on GitHub Pages (`gh-pages` branch) | Shared resource | Signed flat repository (`Packages`, `InRelease`) holding the last N .debs | Yes | The GPG key in secrets. Pages' 1 GB limit means old versions are pruned | Med |
| README | UI | Install instructions per OS, including the unsigned-app steps | Yes | Users need "More info › Run anyway" (Windows) and "Privacy & Security › Open Anyway" (macOS) | Low |
| SignPath Foundation | Dependent | Free open-source code signing for Windows, applied for in parallel (D-25) | Later | Once approved, one signing step in the Windows job. Nothing waits on it | Low |

**Impact dimensions**

- **Data**: none. The app keeps no data beyond its config file.
- **API contracts**: two new IPC commands for the updater (check, install). The Export
  contract is unchanged, and it starts working on two more OSes.
- **Performance**: the update check is one HTTPS GET to GitHub after start-up. It must not delay
  first paint (S-1's start-up gate).
- **User-facing**: the app becomes installable everywhere. Unsigned builds warn once on Windows
  and macOS.
- **Operational**: releasing becomes `git tag vX.Y.Z && git push --tags`. There are four secrets
  to rotate if leaked, and four outside listings to keep alive.
- **Risk of inaction**: a finished viewer that nobody can install.

<!-- -->

> **✎ Notes** · `SPEC §2`
> _(your notes here — replace this line)_

## §3 Options

### Option A: Releases only (Conservative)

- **Description**: one `release.yml` using `tauri-apps/tauri-action` builds the three OSes on a
  tag and attaches the bundles and `latest.json` to a GitHub Release. Channels are filed by
  hand when wanted.
- **Scope**: `release.yml`, `tauri.conf.json`, the updater plugin, README.
- **Effort**: Small
- **Tradeoffs**: + one workflow and no outside accounts. − It covers D-24 and D-28 only. Users must
  find the GitHub page, and D-26 and D-27 stay undone.
- **Compatibility**: additive.

<!-- -->

> **✎ Notes** · `SPEC › Option A: Releases only (Conservative)`
> _(your notes here — replace this line)_

### Option B: Releases, then channels that repackage the released binaries (Recommended)

- **Description**: Option A, plus a job per channel that runs after the Release is published
  and consumes its assets. The winget PR and the Homebrew tap bump take the .msi and .dmg URLs
  and hashes. The snap and the Flatpak repackage the .deb. The apt repo indexes the .deb and
  signs the index. Every OS is built once and shipped through every channel, so a channel can
  never ship a binary that the Release does not have.
- **Scope**: Option A, plus `snap/snapcraft.yaml`, a Flatpak manifest in the Flathub repo, the tap
  repo, an apt-publish job, and Windows and macOS `print_to_pdf`.
- **Effort**: Large, but each channel is a separate task and none blocks the others.
- **Tradeoffs**: + all of D-24 to D-29 within one build. + A channel that breaks fails its own job
  and leaves the Release intact. − Four outside listings, with four secrets. − Flathub prefers
  builds from source, but it accepts a repackaged .deb for an open-source app with a public
  release; if a reviewer insists on source, that becomes a follow-up.
- **Compatibility**: additive.

<!-- -->

> **✎ Notes** · `SPEC › Option B: Releases, then channels that repackage the released binaries (Recommended)`
> _(your notes here — replace this line)_

### Option C: Build every channel from source

- **Description**: the Flatpak builds from source with vendored cargo and npm sources, a
  Launchpad PPA builds the .deb, and the snap builds from source.
- **Scope**: Option B, with three more build systems that each need offline dependency vendoring.
- **Effort**: Large+
- **Tradeoffs**: + the "purest" packaging for distro reviewers. − Three more ways for one release
  to differ from another. − PPA builds need every Rust and npm crate vendored. − Many times the
  maintenance, for no user-visible gain.
- **Compatibility**: additive.

<!-- -->

> **✎ Notes** · `SPEC › Option C: Build every channel from source`
> _(your notes here — replace this line)_

### Comparison

| | Option A | Option B | Option C |
|---|---|---|---|
| Effort | Small | Large (split into tasks) | Large+ |
| Risk | Low | Medium (outside reviews) | High |
| Decisions covered | D-24, D-28 | D-24 to D-29 | D-24 to D-29 |
| Builds per release | 3 | 3 | 6+ |
| Outside accounts | 0 | 4 (winget PR, tap, Snap, Flathub) | 5 (adds Launchpad) |

<!-- -->

> **✎ Notes** · `SPEC › Comparison`
> _(your notes here — replace this line)_

## §4 Recommendation

**Option B.** It is the only option that meets the owner's "fast way, then the rest that are
free" (D-24) with one build per OS. Each channel is a thin repackaging step that the plan can
split into separate tasks.

**Order of work** (for `design`):

1. **Release workflow and versioning.** Semver tags `vX.Y.Z`, starting at `v0.1.0`. The version
   in `tauri.conf.json` and `Cargo.toml` must match the tag, or the workflow fails. Builds:
   - Linux on `ubuntu-24.04`, matching today's CI, so the .deb runs on Ubuntu 24.04 and newer.
   - Windows on `windows-latest`: .msi and NSIS.
   - macOS on `macos-latest`: a `universal-apple-darwin` .dmg, signed ad hoc
     (`signingIdentity: "-"`) so Apple Silicon runs it.

   The workflow publishes a draft Release, runs the install smoke jobs, and only then
   un-drafts it.
2. **Updater (D-28).** `tauri-plugin-updater`, with an endpoint at
   `https://github.com/nuncaeslupus/glossmark/releases/latest/download/latest.json` and the public
   key in `tauri.conf.json`. The private key and its password go in Actions secrets. The updater
   runs only where the app can replace itself (AppImage, the Windows installers, the macOS
   .app). Per D-31 it is off when `FLATPAK_ID` or `SNAP` is set, or when the binary sits under `/usr`
   (the .deb, whether installed from apt or by hand).
3. **Export on Windows and macOS (D-29).**
   - **Windows**: WebView2 `ICoreWebView2_7::PrintToPdf` with print settings, through
     `with_webview`.
   - **macOS**: `WKWebView.printOperation(with:)` with `NSPrintInfo` job disposition
     `NSPrintSaveJob` to the chosen URL. `createPDF` does not work here, because it makes one long
     page, not a paginated document.

   The export must ship before the first Windows or macOS Release.
4. **Channels (D-26, D-27)**, each its own task, in this order:
   1. Homebrew tap: a cask with `auto_updates true`, plus caveats that explain "Open Anyway".
   2. winget.
   3. apt repo.
   4. Snap.
   5. Flathub, last, because its human review takes the longest.
5. **SignPath (D-25)**: apply as soon as the first Release exists, since they review a public
   project. Signing is enabled in a later task once they approve.
6. **README**: an Install section per OS, with the unsigned-app steps.

**Immediate next action**: the owner reviews this spec in the reader. On approval, `design`
writes `arsenal/project/packaging/plan.md` with the contracts (release workflow inputs and
secrets, updater IPC, `print_to_pdf` per OS) and tasks gated on the success criteria above.

**Open questions**

- **Resolved (D-31)**: the updater stays on in the winget and Homebrew installs, so there is one
  binary per OS. The cask declares `auto_updates true`.
- **Unsigned on macOS.** Since macOS 15, right-click › Open no longer bypasses Gatekeeper for an
  unsigned app. The user goes to System Settings › Privacy & Security › Open Anyway once. This is
  accepted by D-24, and the README and the cask caveats say it.
- **Linux arm64.** It is not in D-24. The `ubuntu-24.04-arm` runner is free for public
  repositories, so arm64 could follow later. It is out of scope until asked for.

**Decisions log** (from `status/ideas.md`, unchanged)

| ID | Decision | Status |
|----|----------|--------|
| D-10 | Licence: MIT | agreed |
| D-23 | A simple SVG logo, the app icons generated from it, and a README hero screenshot (I-38); owner approves the look | agreed |
| D-24 | First release through GitHub Releases: a version tag builds .deb/AppImage, .msi/.exe and .dmg on CI runners; the free channels follow; no paid signing or Apple Developer program (owner: a free app) | agreed |
| D-25 | Windows ships unsigned at first (SmartScreen "Run anyway"); apply to SignPath Foundation's free open-source signing in parallel and turn it on once approved | agreed |
| D-26 | First wave of free channels after Releases: winget (Windows), Flathub (Linux), our own Homebrew tap (macOS; the main cask list drops apps that fail Gatekeeper) | agreed |
| D-27 | Ubuntu: also a snap in the Snap Store (App Center) and a signed apt repo on GitHub Pages that CI updates on each tag | agreed |
| D-28 | Direct downloads (AppImage, .msi/.exe, .dmg) update themselves through the Tauri updater, with a free update-signing key in CI secrets; the updater is off in builds for winget, Flathub, Homebrew, Snap and apt, which update through their channel | superseded by D-31 |
| D-29 | Export to PDF works on Windows (WebView2) and macOS (WKWebView) before their builds ship | agreed |
| D-30 | Print and Export paginate well: headings keep with the text that follows, no widow or orphan lines, and code blocks, table rows, images and diagrams are not split where they fit on one page (S-1, task t-6723dbe0) | agreed |
| D-31 | The Tauri updater is on in every build that can replace itself (AppImage, .msi/.exe, .dmg), including the winget and Homebrew installs, which use the same binaries; the cask declares `auto_updates true`. It is off under Flatpak, Snap and the .deb (apt) | agreed |

<!-- -->

> **✎ Notes** · `SPEC §4`
> _(your notes here — replace this line)_

## §5 Contracts

### API contracts

#### Event `update-available`

- **When**: once, after first paint, only when `updater::enabled()` is true and `latest.json`
  names a newer version whose signature verifies.
- **Payload**:
  ```json
  { "version": "0.1.1" }
  ```
- **Backwards compatible**: yes. The event is new, and an older frontend ignores it.

#### Command `install_update()`

- **Request**: none.
- **Response**: never returns on success, because the app restarts into the new version.
- **Errors**: `IpcError { kind: "Io", message }` when the download, the verification or the
  install fails. The frontend shows it as a notice, and the running version keeps working.
- **Backwards compatible**: yes. The command is new.

#### Command `export_pdf(path)` (unchanged)

The contract is the same on every OS: the path must be the Save dialog's last answer and must end
in `.pdf`. On success, Windows and macOS write a paginated PDF instead of returning `Io`.

<!-- -->

> **✎ Notes** · `SPEC › API contracts`
> _(your notes here — replace this line)_

### Inter-service contracts

| Caller | Callee | Protocol | Contract | Failure handling |
|--------|--------|----------|----------|-----------------|
| App | GitHub Releases | HTTPS GET | `releases/latest/download/latest.json` (Tauri updater schema v2), plus the bundle URL and `.sig` it names | Offline or an HTTP error: no notice and no retry until the next start |
| `release.yml` | GitHub Releases | `tauri-action` | Draft Release named `Glossmark vX.Y.Z`, then un-drafted by the smoke job | A failed build or smoke test leaves a draft. Nothing is published |
| `channels.yml` | Tap repo, winget-pkgs, `gh-pages`, Snap Store | git push, komac PR, `snapcraft upload` | Release assets and their sha256 only | Each job fails alone. Rerunning it is safe because each job is idempotent per version |
| Flathub checker | GitHub Releases | HTTPS | `x-checker-data` follows the `latest` release's .deb | Flathub opens no PR. The lag gate (T12) shows it |

<!-- -->

> **✎ Notes** · `SPEC › Inter-service contracts`
> _(your notes here — replace this line)_

### Configuration

| Name | Where | Purpose |
|------|-------|---------|
| `plugins.updater.pubkey`, `plugins.updater.endpoints` | `tauri.conf.json` | Updater verification key and feed |
| `bundle.createUpdaterArtifacts: true` | `tauri.conf.json` | `.sig` files and `latest.json` |
| `bundle.targets` gains `msi`, `nsis`, `dmg`, `app`; `bundle.macOS.signingIdentity: "-"` | `tauri.conf.json` | Windows and macOS bundles; ad-hoc signing so Apple Silicon runs them |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `APT_GPG_PRIVATE_KEY`, `HOMEBREW_TAP_TOKEN`, `WINGET_TOKEN`, `SNAPCRAFT_STORE_CREDENTIALS` | Actions secrets | Release and channel credentials, never in the repo |

<!-- -->

> **✎ Notes** · `SPEC › Configuration`
> _(your notes here — replace this line)_

### Database migrations

| Service | Database | Change | Reversible | Forward-compatible |
|---------|----------|--------|------------|-------------------|
| — | none | No stored data changes; the config file is untouched | yes | yes |

<!-- -->

> **✎ Notes** · `SPEC › Database migrations`
> _(your notes here — replace this line)_

## §6 Risks & Validation

| Risk | Likelihood | Impact | Mitigation | Validation |
|------|-----------|--------|------------|------------|
| The updater signing key is lost, so no existing install can verify an update again | Low | High | The owner keeps an offline copy of the key and its password, and T7 records where | Manual: T7 checklist |
| The updater signing key leaks, so someone could sign a malicious update | Low | High | The key lives only in secrets, behind a password. Rotation means shipping a new pubkey in a release signed with the old key | Security: `secrets_in_repo == 0` (gitleaks) |
| SmartScreen or Gatekeeper warnings scare users off | High | Med | README steps, cask caveats, and SignPath (T13) for Windows | Manual |
| Flathub rejects a repackaged .deb | Med | Med | Follow their policy for prebuilt open-source apps. If a reviewer insists on a source build, that becomes a follow-up task | Manual: review outcome in T12 |
| Snap strict confinement blocks files outside home or removable media | Med | Low | README says so. `personal-files` or classic confinement can be requested later if users ask | Manual |
| The macOS print API returns one long page, or blank pages for content below the fold | Med | Med | Use `printOperation` and not `createPDF`. Diagrams are drawn first, as on Linux (`diagramsForPaper`) | Owner judges `export_pdf_pages_delta <= 1` (T5) |
| The updater fights a channel's own updates | Low | Med | D-31: off under Flatpak, Snap and `/usr`. The cask declares `auto_updates true`, so brew leaves the app alone | Unit: `test_updater_is_off_in_flatpak_snap_and_usr` |
| A broken release reaches users | Low | High | Draft until every smoke job passes. Rollback: delete the release, or publish `vX.Y.Z+1`, since `latest.json` follows the latest release | CI: `install_smoke_failures == 0` |

<!-- -->

> **✎ Notes** · `SPEC §6`
> _(your notes here — replace this line)_

