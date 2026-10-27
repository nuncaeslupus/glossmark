# Glossmark — Plan (annotated edition)

> Generated 2026-10-27. This is the document with a **note slot** after every section that has text of its own. Read it in any Markdown app. To annotate, replace the `_(your notes…)_` placeholder under any section. When done, send the file back — notes are acted on.

---

# Plan

## Preamble & scope

**Date**: 2026-10-26
**Specification**: `status/specification.md` (approved, revision 3)
**Author**: nuncaeslupus, with Claude
**Revision**: 1
**Status**: approved (2026-10-26, revision 1) — without annotations
**Revision log**:
- r1 — first draft

> Review record, kept the way the spec keeps its own: each round of notes bumps
> **Revision** with a log line naming the `<repo>-plan-v<N>-<date>-notes.md`
> export it applied, committed beside this file in the same commit. Approval is
> `approved (YYYY-MM-DD, revision N)`, plus `— without annotations` when there
> were none.

<!-- -->

> **✎ Notes** · `PLAN · intro`
> _(your notes here — replace this line)_

## Technical solution

### Architecture overview

One Tauri v2 window. The Rust core (`src-tauri/`) is a thin OS layer: it reads and watches
files, keeps the config, enforces the filesystem scope and turns CLI arguments, second
launches and file associations into `open-files` events. Everything visible is the web
frontend (`src/`), plain TypeScript built by Vite, with no UI framework:

```
src/
  main.ts            boot, wires the bar, tabs and IPC
  strings.ts         every UI string (D-14)
  ui/                bar.ts, menus.ts, tabs.ts, outline.ts, find.ts, zoom.ts, empty.ts
  render/            pipeline.ts (markdown-it + plugins), sanitize.ts, enhance/ (highlight,
                     katex, mermaid, anchors, svg-inline, images)
  themes/            glossmark.css (light + dark via custom properties), print.css, fonts/
src-tauri/src/
  main.rs, commands.rs, scope.rs, watch.rs, config.rs
```

The window has **one slim bar**, modelled on Chrome's PDF viewer (D-11): tab strip above;
in the bar the Outline toggle, the document title, HTML menus (File, View, Go, Help), Back,
Forward, zoom (−, percentage, +), Find and Print. There is no native menu bar, no status bar
and no second toolbar; the menus are drawn in the bar, as Chrome's viewer draws its own.

```drawspec
{"version": 1, "kind": "flow",
 "nodes": [
  {"id": "os", "text": "CLI, second launch, file association, drop", "role": "start"},
  {"id": "core", "text": "Rust core: scope check, read, watch, config"},
  {"id": "tab", "text": "Tab: path, history, scroll, zoom"},
  {"id": "pipe", "text": "Render: markdown-it, DOMPurify, enhancers"},
  {"id": "sheet", "text": "Paper sheet", "role": "terminal"}
 ],
 "edges": [
  {"from": "os", "to": "core", "label": "open-files"},
  {"from": "core", "to": "tab", "label": "read_document"},
  {"from": "tab", "to": "pipe"},
  {"from": "pipe", "to": "sheet"},
  {"from": "core", "to": "tab", "label": "document-changed"}
 ]}
```

<!-- -->

> **✎ Notes** · `PLAN › Architecture overview`
> _(your notes here — replace this line)_

### Data flow

1. A path arrives (`open-files` event, File › Open, drop or a link). The core adds its folder to
   the scope and the frontend opens or focuses a tab.
2. The tab calls `read_document`, runs the pipeline (parse → sanitise → insert → enhance) and
   calls `watch`.
3. Enhancers run after insertion: heading anchors and the outline first, then highlight.js,
   KaTeX, local image URLs (`convertFileSrc`), SVG inlining (`read_svg` → sanitise → insert),
   and Mermaid last, imported only when a `mermaid` fence exists.
4. On `document-changed`, the tab re-runs steps 2–3 and restores the scroll offset by the
   nearest heading anchor plus offset.

<!-- -->

> **✎ Notes** · `PLAN › Data flow`
> _(your notes here — replace this line)_

### State changes

| Service | Database | Change | Description |
|---------|----------|--------|-------------|
| Rust core | `config.json` | CREATE/UPDATE | Theme, default zoom, remote images, recent files |
| Rust core | window-state file | CREATE/UPDATE | Window size and position (plugin-owned) |
| Frontend | memory only | — | Tabs, per-tab history and scroll; not persisted in v1 |

<!-- -->

> **✎ Notes** · `PLAN › State changes`
> _(your notes here — replace this line)_

### Technology choices

| Choice | Justification |
|--------|--------------|
| Tauri v2, `tauri-plugin-single-instance`, `-opener`, `-dialog`, `-window-state` | D-2; official plugins cover second launch, external links, the Open dialog and window size |
| `notify` (Rust) | De-facto file watcher; debounced 100 ms in `watch.rs` |
| Vite + TypeScript, no UI framework | The UI is one bar, tabs and a sidebar; a framework would outweigh it |
| markdown-it + plugins: footnote, deflist, abbr, mark, sub, sup, emoji, task-lists, github-alerts, front-matter, texmath/KaTeX, wikilinks | Option B; each construct in D-7 is an existing plugin |
| DOMPurify | The standard sanitiser; also has an SVG profile for D-13 |
| highlight.js, KaTeX, Mermaid (lazy `import()`) | GitHub-parity enhancers; Mermaid only loaded when used (D-5) |
| Vitest + jsdom | Fast unit tests for the pipeline, sanitiser, history and strings |
| Playwright with WebKit | The closest engine to WebKitGTK available in CI, for layout, theme, print and Mermaid tests |
| Bundled fonts (e.g. Source Serif 4, Inter, JetBrains Mono, all OFL) | Same look on every machine and in print |
| Makefile: `sync`, `lint`, `format`, `test`, `build`, `clean`, `update-skills` | Owner's convention; also the arsenal `host-gate` (`make lint test`) |

<!-- -->

> **✎ Notes** · `PLAN › Technology choices`
> _(your notes here — replace this line)_

### Out of scope

- Editing (S-3), folder sidebar (I-20), theme picker (I-22), translations (I-23 beyond the strings file).
- Windows, macOS, Flathub, Snap and store submissions (S-4).
- Native menu bar, status bar, thumbnails, annotations, export formats other than print-to-PDF.
- Rendering `drawspec` fences (they show as code, D-13).
- Persisting tabs between launches.

<!-- -->

> **✎ Notes** · `PLAN › Out of scope`
> _(your notes here — replace this line)_

## Implementation tasks

Real-world READMEs for the visual parity check (T17): `rust-lang/rust`, `mermaid-js/mermaid`
and `sindresorhus/awesome`, each saved under `docs/fixtures/readmes/` with its images.

| T# | Description | Scope | Service | Size | Depends | Gate | Tests |
|----|-------------|-------|---------|------|---------|------|-------|
| T1 | Scaffold and CI | Scaffold Tauri v2 + Vite + TS, Makefile, CI (lint, type-check, Vitest, cargo test); set arsenal `host-gate = "make lint test"` and `preflight-gate` | repo | M | — | `ci_failed_checks == 0` | `test_app_boot_with_no_file_shows_empty_state` in `src/main.test.ts` — booting with no paths renders the "Open or drop a Markdown file" area |
| T2 | CommonMark pipeline | Render pipeline core: markdown-it with CommonMark settings, run the CommonMark spec suite | frontend | M | T1 | `commonmark_spec_pass_rate == 1.0` | `test_commonmark_spec_all_examples_match` in `src/render/commonmark.test.ts` — every example in spec.json renders to its expected HTML (normalised) |
| T3 | GFM extensions | GFM: tables, task lists, strikethrough, extended autolinks, tag filter | frontend | M | T2 | `gfm_extension_examples_pass_rate == 1.0` | `test_gfm_extension_examples_all_match` in `src/render/gfm.test.ts` — every example in the GFM spec's extension sections matches |
| T4 | Extras and fixture | Extras: footnotes, alerts, emoji, front-matter block, KaTeX math, `==mark==`, sup/sub, wiki links, abbreviations, definition lists; write `docs/fixtures/all-features.md` | frontend | M | T3 | `parser_fixture_constructs_rendered == 1.0` | `test_feature_fixture_parser_constructs_present` in `src/render/fixture.test.ts` — each parser-level construct in the fixture yields its expected element (`mark`, `sup`, `sub`, `abbr`, `dl`, `.katex`, `.markdown-alert`, `section.footnotes`) |
| T5 | Sanitiser and CSP | Sanitiser: DOMPurify allowlist for GitHub's safe HTML (D-15), CSP in `tauri.conf.json`, links rewritten to safe handlers | frontend | S | T2 | `script_execution_from_document == 0` | `test_sanitize_hostile_fixture_nothing_executes` in `src/render/sanitize.test.ts` — `<script>`, `on*=`, `javascript:` and `<iframe>` are all removed; `test_sanitize_safe_html_kept` — `details`, `kbd`, `img`, `sub` survive |
| T6 | Enhancers | Enhancers: highlight.js with copy button, heading anchors and outline data, Mermaid lazy-loaded with `securityLevel: 'strict'` | frontend | M | T4, T5 | `feature_fixture_constructs_rendered == 1.0` | `test_feature_fixture_all_constructs_rendered` in `e2e/fixture.spec.ts` (Playwright WebKit) — every construct incl. highlighted code and Mermaid `svg` is present; `test_mermaid_absent_not_loaded` — a doc without Mermaid never requests its chunk |
| T7 | Rust core | Rust core: `read_document`, `watch`/`unwatch`, `open-files` (CLI, single instance), config, user CSS, `open_external`, filesystem scope | core | L | T1 | `out_of_scope_reads_allowed == 0` | `test_read_document_outside_scope_not_permitted` in `src-tauri/src/scope.rs` — a path outside opened folders returns `not_permitted`; `test_config_unknown_version_falls_back_to_defaults` in `config.rs` |
| T8 | Images | Images: local via asset protocol, local SVG inlining (sanitised, IDs prefixed), remote-images setting rebuilding CSP `img-src` | frontend + core | M | T5, T7 | `network_requests_with_remote_images_off == 0` | `test_remote_images_off_no_requests` in `e2e/images.spec.ts` — no request leaves the app with the setting off; `test_svg_inline_style_tags_stripped` in `src/render/enhance/svg.test.ts` |
| T9 | Signature theme | Signature theme: paper sheet on grey canvas, typography, light and dark, bundled fonts, user CSS loaded last | themes | L | T6, T8 | `themed_svg_fill_matches_text_colour == true` | `test_currentcolor_svg_follows_theme_light_and_dark` in `e2e/theme.spec.ts` — the fixture SVG's computed fill equals the body text colour in both themes; `test_body_text_contrast_at_least_aa` — contrast ≥ 4.5 in both themes |
| T10 | Print | Print stylesheet: no app controls, no canvas, no breaks inside code, tables, figures | themes | S | T9 | `print_parity_owner_signoff == true` | `test_print_media_hides_app_controls` in `e2e/print.spec.ts` — under `emulateMedia('print')` the bar, tabs and outline are not displayed |
| T11 | Window shell | Window shell: the slim bar (Chrome PDF viewer layout), HTML menus, tab strip, empty state with recent files, `strings.ts` | frontend | L | T7 | `toolbar_buttons <= 8` | `test_ui_definition_within_simplicity_budget` in `src/ui/budget.test.ts` — bar buttons ≤ 8, settings ≤ 4, dialogs while reading == 0; `test_strings_all_ui_text_from_strings_file` |
| T12 | Navigation | Navigation: per-tab back/forward, `.md` links in place, Ctrl/middle-click new tab, `#anchors`, wiki-link resolution, external links to the OS | frontend | M | T11 | `link_routing_cases_failed == 0` | `test_link_routing_table_all_cases` in `src/ui/links.test.ts` — each (link kind, modifier) pair routes to the expected action; `test_history_back_after_two_links_returns_first` |
| T13 | Reading tools | Reading tools: outline sidebar with current section, find (own TreeWalker search), zoom incl. fit-width, View › Theme, settings in menus | frontend | M | T6, T11 | `keyboard_shortcuts_missing == 0` | `test_every_bar_action_has_shortcut` in `src/ui/shortcuts.test.ts` — each bar and menu action maps to a shortcut listed in Help › Keyboard Shortcuts; `test_find_cycles_matches_forward_and_back` in `e2e/find.spec.ts` |
| T14 | Live reload | Live reload: re-render on `document-changed`, keep scroll by nearest heading, deleted-file notice | frontend + core | S | T7, T11 | `live_reload_ms <= 500` | `test_live_reload_after_save_updates_and_keeps_scroll` in `e2e/reload.spec.ts` — after an external write the change appears and scroll moves less than one screen |
| T15 | Performance | Performance: benchmarks for 100 KB and 1 MB docs, 20 Mermaid diagrams; move parsing to a Web Worker only if the bound fails | frontend | M | T6 | `render_ms_1MB <= 1500` | `test_render_1mb_within_budget_no_long_tasks` in `e2e/perf.spec.ts` — 1 MB with 20 diagrams rendered and interactive ≤ 1500 ms, diagrams drawn as they approach the view, no task longer than 200 ms |
| T16 | Linux packaging | Linux packaging: `.desktop`, MIME association for `text/markdown`, icon, `.deb` and AppImage built in CI on every PR | repo | M | T7 | `deb_package_mb <= 20` | `test_desktop_file_declares_markdown_mime` in `src-tauri/tests/desktop_file.rs`; CI step fails when the `.deb` exceeds 20 MB |
| T17 | Acceptance | Acceptance on the reference machine and a fresh Ubuntu 24.04 VM: first paint, idle RSS, install and double-click, owner's review of simplicity and GitHub parity (fixture + three READMEs) | repo | M | T10, T12, T13, T14, T15, T16 | `first_paint_ms_100KB <= 500` | `scripts/measure.sh` records `first_paint_ms_100KB` and `idle_rss_mb` (≤ 250 with three 100 KB tabs); owner sign-off recorded in the Evidence log |

**Status legend**: ☐ not started · ◐ in progress · ☑ merged

**Merge order**: T1; then T2 and T7 in parallel; T3, T5, T11, T16 as their dependencies land;
T4 → T6 → T8 → T9 → T10; T12, T13, T14, T15 in parallel after their dependencies; T17 last.
**Branch pattern**: `s1-t<N>-description` from `main`, one PR per task.

<!-- -->

> **✎ Notes** · `PLAN › Implementation tasks`
> _(your notes here — replace this line)_

### Dependency graph

Generated from the **Depends** column — never drawn by hand.

```drawspec
{"version": 1, "kind": "flow", "title": "Task dependencies — phases",
 "nodes": [
  {"id": "P1", "text": "Phase 1\nT1, T2, T7, T3, T5, T11, T16, T4, T8"},
  {"id": "P2", "text": "Phase 2\nT12, T14, T6, T9, T13, T15, T10, T17"}
 ],
 "edges": [
  {"from": "P1", "to": "P2"}
 ]}
```

**Phase 1** — T1, T2, T7, T3, T5, T11, T16, T4, T8

```drawspec
{"version": 1, "kind": "flow", "title": "Task dependencies — phase 1",
 "nodes": [
  {"id": "T1", "text": "T1\nScaffold and CI"},
  {"id": "T2", "text": "T2\nCommonMark pipeline"},
  {"id": "T7", "text": "T7\nRust core"},
  {"id": "T3", "text": "T3\nGFM extensions"},
  {"id": "T5", "text": "T5\nSanitiser and CSP"},
  {"id": "T11", "text": "T11\nWindow shell"},
  {"id": "T16", "text": "T16\nLinux packaging"},
  {"id": "T4", "text": "T4\nExtras and fixture"},
  {"id": "T8", "text": "T8\nImages"}
 ],
 "edges": [
  {"from": "T1", "to": "T2"},
  {"from": "T2", "to": "T3"},
  {"from": "T3", "to": "T4"},
  {"from": "T2", "to": "T5"},
  {"from": "T1", "to": "T7"},
  {"from": "T5", "to": "T8"},
  {"from": "T7", "to": "T8"},
  {"from": "T7", "to": "T11"},
  {"from": "T7", "to": "T16"}
 ]}
```

**Phase 2** — T12, T14, T6, T9, T13, T15, T10, T17 (with T4, T5, T8, T11, T16 from earlier phases)

```drawspec
{"version": 1, "kind": "flow", "title": "Task dependencies — phase 2",
 "nodes": [
  {"id": "T4", "text": "T4\nphase 1"},
  {"id": "T5", "text": "T5\nphase 1"},
  {"id": "T8", "text": "T8\nphase 1"},
  {"id": "T11", "text": "T11\nphase 1"},
  {"id": "T16", "text": "T16\nphase 1"},
  {"id": "T12", "text": "T12\nNavigation"},
  {"id": "T14", "text": "T14\nLive reload"},
  {"id": "T6", "text": "T6\nEnhancers"},
  {"id": "T9", "text": "T9\nSignature theme"},
  {"id": "T13", "text": "T13\nReading tools"},
  {"id": "T15", "text": "T15\nPerformance"},
  {"id": "T10", "text": "T10\nPrint"},
  {"id": "T17", "text": "T17\nAcceptance"}
 ],
 "edges": [
  {"from": "T4", "to": "T6"},
  {"from": "T5", "to": "T6"},
  {"from": "T6", "to": "T9"},
  {"from": "T8", "to": "T9"},
  {"from": "T9", "to": "T10"},
  {"from": "T11", "to": "T12"},
  {"from": "T6", "to": "T13"},
  {"from": "T11", "to": "T13"},
  {"from": "T11", "to": "T14"},
  {"from": "T6", "to": "T15"},
  {"from": "T10", "to": "T17"},
  {"from": "T12", "to": "T17"},
  {"from": "T13", "to": "T17"},
  {"from": "T14", "to": "T17"},
  {"from": "T15", "to": "T17"},
  {"from": "T16", "to": "T17"}
 ]}
```

<!-- -->

> **✎ Notes** · `PLAN › Dependency graph`
> _(your notes here — replace this line)_

## Evidence log

`execution` appends one row per task as it lands (RED → GREEN → RECORD). A gated task is not
"done" until its row is complete and the measured value meets the gate.

| T# | Gate | Measured | Command | SHA | Env | Date |
|----|------|----------|---------|-----|-----|------|
| T17 | `first_paint_ms_100KB <= 500` (asserted at a 900 ms WebKitGTK floor) | **648 ms** ✗ vs 500, ✓ vs 900 (launch-to-read 481 + render 167; see note) · idle_rss **412 MB** PSS vs 250 MB target ✗ (see note) | `scripts/measure.sh` | 916fd2d | reference (WebKitGTK, Wayland) | 2026-10-27 |

> **T17 first paint, corrected.** The first recorded 167 ms was the in-page WebKit render
> alone, not the spec's "from launching `glossmark big.md` to the sheet being visible".
> `measure.sh` now adds the release binary's launch-to-document-read (time to the first
> inotify OPEN of the file: process, GTK and WebKitGTK start-up, bundle load, IPC; 458–491 ms
> over nine runs) to the render. The total, about 650–680 ms, misses the 500 ms budget.
> **Owner sign-off (2026-10-27): accepted as a documented WebKitGTK start-up deviation (same
> decision as T18); the gate asserts a 900 ms regression floor, and a start-up speed task is
> queued to bring it under 500 ms.**

> **T17 idle-RSS deviation.** `idle_rss_mb` (three 100 KB tabs) is about 400 MB (398–412 over five runs) (summed PSS, the
> footprint with shared library pages counted once), over the 250 MB target. The cause is
> WebKitGTK's irreducible baseline: the app with **no document open is already 282 MB** PSS;
> the first 100 KB tab adds ~100 MB and two more only ~22 MB. WebKitGTK is the real Tauri
> Linux engine (same finding as T18's render freeze), so the 250 MB target is not reachable
> there. `first_paint_ms_100KB` is the gate metric (see the corrected first-paint note). The
> idle-RSS target is an owner sign-off item, not the gate's metric. **Owner sign-off
> (2026-10-27): accepted as a documented WebKitGTK engine-floor deviation (same decision as
> T18's perf budgets).** Empty-app breakdown: WebKitWebProcess 146 MB + UI 108 MB + network
> 16 MB = ~270 MB native, before any document; the whole eager JS bundle is 648 KB (~2-3 MB
> heap) and Mermaid is already lazy, so no frontend change reaches 250 MB. Per-document cost
> is ~40 MB/tab. The only baseline lever is a lighter webview engine than WebKitGTK — tracked
> separately, out of scope for T17.

> **T17 GitHub parity.** The owner compared the all-features fixture and the three READMEs
> (`rust-lang/rust`, `mermaid-js/mermaid`, `sindresorhus/awesome`) side by side with GitHub.
> **Owner sign-off (2026-10-27): parity accepted, with these gaps queued as follow-up
> tasks** (`status/ideas.md` I-30 to I-37): `<img height>` ignored (Mermaid logo page-wide), an
> image in the GitHub Issues section too small, Gantt charts squashed vertically, no
> zoom/pan on Mermaid diagrams, front matter laid out horizontally rather than as a
> key/value table, copy button not GitHub's and hover-only, heading anchors hard to reach
> and not GitHub's chain icon, and a sans-serif body wanted. Where Glossmark goes beyond
> GitHub on purpose (extras syntax, `currentColor` SVGs following the theme), it was not
> counted as a gap. The README copies in `docs/fixtures/readmes/` are text only: their relative
> images (awesome's `media/logo.svg`, mermaid's `./img/header.png`) were not vendored, so they
> show as broken there; the comparison was judged on the rest.

> **T17 simplicity.** The owner used the app throughout the T17 review (opening documents, tabs,
> links, Back). **Owner sign-off (2026-10-27): simplicity accepted.** Their
> toolbar and view ideas are kept as later improvements (`status/ideas.md` I-24 to I-29), not
> as failures.

> **T17 install and double-click.** On a fresh **Ubuntu 26.04.1 LTS** VM (GNOME Boxes, KVM),
> `sudo apt install ./Glossmark_0.1.0_amd64.deb` (built from 29edaa2) installed cleanly and
> double-clicking a `.md` file opened it in Glossmark as the default app. **Owner sign-off
> (2026-10-27): passed.** Deviation: the plan names 24.04, but the owner's machine and target
> are 26.04, and a `.deb` built there needs glibc 2.43 (24.04 ships 2.39); CI still builds the
> `.deb` on ubuntu-24.04.

<!-- -->

> **✎ Notes** · `PLAN › Evidence log`
> _(your notes here — replace this line)_

## Sign-off

- [ ] Plan reviewed by the owner (annotated reader)
- [ ] Tauri IPC contract (spec §5) agreed
- [ ] No migrations; config file versioned
- [ ] Ready for execution

<!-- -->

> **✎ Notes** · `PLAN › Sign-off`
> _(your notes here — replace this line)_

