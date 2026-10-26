# Glossmark — Specification (annotated edition)

> Generated 2026-10-26. This is the document with a **note slot** after every section that has text of its own. Read it in any Markdown app. To annotate, replace the `_(your notes…)_` placeholder under any section. When done, send the file back — notes are acted on.

---

# Specification

## Preamble & scope

**Date**: 2026-10-26
**Ticket / PR**: S-1 in `status/ideas.md`
**Author**: nuncaeslupus, with Claude
**Revision**: 3
**Status**: approved (2026-10-26, revision 3) — without annotations
**Revision log**:
- r1 — first draft
- r2 — applied `glossmark-spec-v1-2026-10-26-2236-notes.md`: simplicity as the signature (D-11), open questions answered (D-12 to D-15), themed SVG images, distribution channels
- r3 — owner approved r2 in chat with one clarification: "simple" means like Chrome's PDF viewer, only those few items; the Chrome bullet now follows that layout

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

On Linux, Markdown files are read either as raw text or through tools that render them
poorly. Okular, for example, shows plain styling, no syntax highlighting, no math and no
diagrams. Meanwhile the same file looks polished on GitHub. Most desktop Markdown apps
are editors with a preview pane, not readers. Glossmark v1 is a free, open-source,
**read-only** desktop viewer that opens a `.md` file and presents it the way a PDF
reader presents a PDF: a typeset paper sheet with menus, a small toolbar, an outline and
tabs. It must render everything GitHub renders plus a set of common extensions. It ships
on Linux first (D-4), built on Tauri v2 (D-2) so the Windows and macOS releases (S-4)
reuse the same code. Editing is out of scope (D-3, S-3). There is no outage behind this;
it is a planned new product.

**Ideas covered**: I-1, I-2, I-3, I-4, I-5, I-6, I-7, I-8, I-9, I-10, I-11, I-15, I-16, I-17, I-18, I-19, I-21, I-23 (strings ready for it).
Recorded for later, not built in v1: I-20 (folder sidebar), I-22 (theme picker).

**Design principle — simplicity is the signature (D-11).** Glossmark's identity is a UI
that gets out of the way: the document is the interface. Nothing on screen competes with
the page. Every feature is one click or one shortcut away, and reading never raises a
question or a dialog. When a feature cannot be added without making the window busier,
it waits.

**v1 scope at a glance**

- **Rendering (D-7)**: CommonMark and GFM (tables, task lists, strikethrough, autolinks), footnotes,
  GitHub alerts (`> [!NOTE]` and the other four), emoji shortcodes, KaTeX math (`$…$`, `$$…$$`),
  Mermaid (D-5), front matter shown as a compact metadata block, and the extras:
  `==highlight==`, `^sup^`, `~sub~`, `[[wiki links]]`, abbreviations, definition lists.
  Code blocks get syntax highlighting and a copy button. Headings get anchor links.
  Safe raw HTML is kept, as GitHub does (`<details>`, `<kbd>`, `<img>`, `<sub>`, tables…);
  everything else is stripped (D-15). Remote images load by default (D-12).
- **Images**: local and remote images display normally. Local `.svg` files are inlined into the
  page after sanitising, so SVGs drawn to inherit the text colour (for example drawspec's
  `--profile inline` output) follow the theme in light and dark (D-13). ` ```drawspec ` source
  fences are shown as code; documents include drawspec diagrams as rendered SVG/PNG files.
- **Layout (D-6)**: a fixed-width paper sheet on a grey canvas with continuous scroll.
  Printing uses the same styling, minus the canvas and the app's controls.
- **Look (D-9)**: one signature theme (book-style serif body, sans-serif headings, monospace code,
  fonts bundled) in light and dark, following the system setting by default. A user CSS file is
  loaded last if present. Themes are plain stylesheets.
- **Navigation (D-8)**: tabs, each with its own back/forward history. A link to a local `.md` file
  opens in the current tab; Ctrl-click or middle-click opens a new tab. `#anchor` links scroll
  within the page. External links open in the system browser.
- **Reading tools**: an outline sidebar built from the headings (click to jump, current section
  highlighted); find in page (Ctrl+F); zoom (Ctrl +/−/0 and fit-width); live reload that keeps the
  scroll position; print / save as PDF; recent files.
- **Language**: the UI is in English. Every UI string lives in one file, so translations
  can be added later without touching the code (D-14, I-23).
- **Distribution**: v1 builds a `.deb` and an AppImage. Flathub, Snap, the Microsoft Store
  and macOS (DMG / Homebrew / App Store) come with S-4. PyPI is not a channel:
  it serves Python packages, and Glossmark is a native app.
- **Opening files (I-19)**: File › Open, drag-and-drop, `glossmark <file>…` from a terminal, and
  the desktop file association for `.md` / `.markdown`. A second launch opens its files as tabs in
  the running window (single instance).
- **Chrome (I-10, D-11)**: the reference is Chrome's built-in PDF viewer: one slim bar and
  nothing else, adapted to Markdown. Above it the tab strip; in it, left to right: the Outline
  toggle, the document title, the menus (File, View, Go, Help), Back and Forward, zoom
  (− , percentage, +), Find and Print. Open and Theme live in the menus. No second toolbar,
  no status bar, no side panels besides the outline. With no file open, the window shows a single
  "Open or drop a Markdown file" area and the recent files. Every toolbar action also has a keyboard
  shortcut. Settings are limited to what a viewer needs: theme, default zoom, remote
  images on/off (default on), and the remembered window size and recent files.

```drawspec
{"version": 1, "kind": "flow",
 "nodes": [
  {"id": "file", "text": ".md file on disk", "role": "store"},
  {"id": "core", "text": "Rust core: read file, watch for changes, CLI and file association"},
  {"id": "parse", "text": "markdown-it + plugins: Markdown to HTML"},
  {"id": "clean", "text": "DOMPurify: strip scripts and unsafe HTML"},
  {"id": "enhance", "text": "Enhance: highlight code, KaTeX, Mermaid (lazy), outline"},
  {"id": "sheet", "text": "Paper sheet in the active tab", "role": "terminal"}
 ],
 "edges": [
  {"from": "file", "to": "core"},
  {"from": "core", "to": "parse", "label": "on open and on every save"},
  {"from": "parse", "to": "clean"},
  {"from": "clean", "to": "enhance"},
  {"from": "enhance", "to": "sheet"}
 ]}
```

**Success criteria (measurable)**:

Measured on the reference machine (the owner's Ubuntu laptop) with release builds, unless stated otherwise.

- [ ] `commonmark_spec_pass_rate == 1.0`: the renderer passes every example of the CommonMark spec test suite.
- [ ] `gfm_extension_examples_pass_rate == 1.0`: every example in the GFM spec's extension sections (tables, task lists, strikethrough, autolinks) passes.
- [ ] `feature_fixture_constructs_rendered == 100%`: `docs/fixtures/all-features.md` holds one example of every construct in the v1 scope above, and a snapshot test asserts the expected element for each (e.g. `mark`, `sup`, `sub`, `abbr`, `dl`, `.katex`, an alert box, an emoji character, a Mermaid `svg`).
- [ ] `script_execution_from_document == 0`: a fixture containing `<script>`, `onerror=`, `javascript:` links and an `<iframe>` renders with none of them active (automated test).
- [ ] `themed_svg_fill_matches_text_colour == true`: a fixture SVG that uses `currentColor` is drawn in the theme's text colour, in both light and dark (automated test).
- [ ] `toolbar_buttons <= 8`, `settings <= 4`, `dialogs_while_reading == 0` (only Open and Print show a dialog; checked against the UI definition in a test).
- [ ] Simplicity, **judged by the owner**: a first-time user can open, read, navigate and print a document without looking anything up, and the window shows nothing they would call clutter.
- [ ] `network_requests_with_remote_images_off == 0`: with remote images off, opening the fixture makes no network request; with them on, only image URLs are requested.
- [ ] `first_paint_ms_100KB <= 500`: from launching `glossmark big.md` (100 KB, ~2,500 lines) to the sheet being visible.
- [ ] `render_ms_1MB <= 1500`: a 1 MB document is fully rendered (all Mermaid included, at most 20 diagrams) without the window freezing for more than 200 ms at a time.
- [ ] `live_reload_ms <= 500`: from saving the file in another editor to the change appearing; the scroll offset changes by less than one screen.
- [ ] `deb_package_mb <= 20` for the Linux `.deb`. The AppImage is also built, but it bundles WebKitGTK, so its size is reported, not gated.
- [ ] `idle_rss_mb <= 250` with three 100 KB documents open in tabs.
- [ ] Visual parity with GitHub, **judged by the owner**: `all-features.md` and three real-world READMEs (to be named in the plan) are rendered side by side with GitHub. Every construct GitHub renders must appear in Glossmark with the same meaning, and the owner signs off that Glossmark looks at least as good. Differences in style are expected; missing or broken constructs fail.
- [ ] Print parity, **judged by the owner**: printing `all-features.md` to PDF gives the same typography as the screen, with no app controls, code and tables not cut mid-line, and math and diagrams present.
- [ ] Keyboard completeness: every toolbar action is reachable by a shortcut, listed in Help › Keyboard Shortcuts (checked against a list in the test suite).
- [ ] Linux packaging: CI builds `.deb` and AppImage on every PR to `main`. A fresh Ubuntu 24.04 VM can install the `.deb`, double-click a `.md` file and see Glossmark open it.

<!-- -->

> **✎ Notes** · `SPEC §1`
> _(your notes here — replace this line)_

## §2 Systems & Impact

Glossmark is a new repository, so nothing existing changes. The table lists the parts v1
creates and the outside systems it depends on.

| System | Type | Role | Needs changes? | Impact | Severity |
|--------|------|------|----------------|--------|----------|
| Rust core (`src-tauri/`) | Primary | Tauri v2 app: window, menus, single-instance, CLI args, file read, file watching, recent files, settings file | Yes (new) | Kept small: no parsing in Rust. Owns every filesystem access, scoped to the files the user opened and their folders (for images and linked `.md`). | Med |
| Web frontend (`src/`) | Primary | Plain TypeScript + Vite: tabs, toolbar, outline, find, zoom; the render pipeline (markdown-it → DOMPurify → enhancers) | Yes (new) | All rendering lives here, so one language covers every Markdown feature. No UI framework: the chrome is a few components. | High |
| Themes (`src/themes/`) | Primary | Signature theme as CSS, light and dark; bundled fonts; print stylesheet; user CSS hook | Yes (new) | This is where "beautiful" is won or lost; it gets its own tasks and the owner's review. | High |
| System webview | Dependent | WebKitGTK on Linux (WebView2 on Windows, WKWebView on macOS later) | No, validate | Rendering differences between engines; WebKitGTK printing and `window.find` behaviour must be checked early. | Med |
| npm plugins | Dependent | markdown-it and its plugins, DOMPurify, highlight.js, KaTeX, Mermaid | No, validate | Versions pinned with a lockfile; Mermaid (~2 MB) is loaded only when a document contains a diagram. | Low |
| Desktop integration | Infrastructure | `.desktop` file, MIME association for `text/markdown`, icon | Yes (new) | Needed for double-click to open. | Low |
| CI (GitHub Actions) | Infrastructure | Lint, type-check, tests, build `.deb` / AppImage on PRs | Yes (new) | Also gives the arsenal its `host-gate` and lets `merge-policy` stay `after-ci`. | Med |
| Project docs (`docs/`) | Dependent | README, user guide, fixtures; diagrams as `drawspec` fences (I-15) | Yes (new) | No runtime impact. | Low |

**Impact dimensions**

- **Data**: Low. The app is read-only on documents; it writes only its own settings and recent-files list.
- **API contracts**: none public. The only internal contract is the set of Tauri commands between the frontend and the core; `design` defines it.
- **Performance**: Medium. Large documents and many Mermaid diagrams are the stress cases; the criteria above bound them.
- **User-facing**: High. This is the product.
- **Security**: Medium. A Markdown file can embed raw HTML. Sanitising, a strict content-security policy, a scoped filesystem and opening external links outside the app keep a hostile document from running code or reading files.
- **Operational**: Low. There is no server; releases are packages.
- **Risk of inaction**: Low. Nothing breaks, but the product does not exist.

<!-- -->

> **✎ Notes** · `SPEC §2`
> _(your notes here — replace this line)_

## §3 Options

D-2 fixes the shell as Tauri v2. The open choice is **where Markdown becomes HTML**, which
decides how much of D-7 comes from existing plugins and how much has to be written.

<!-- -->

> **✎ Notes** · `SPEC §3`
> _(your notes here — replace this line)_

### Option A: Render in Rust with comrak (Conservative)

- **Description**: The Rust core parses Markdown with `comrak` (GFM-compatible, with footnotes, front matter, alerts, wiki links, superscript, subscript and description lists built in) and sends HTML to the webview. The frontend only adds highlighting, KaTeX and Mermaid.
- **Scope**: `src-tauri/` does the parsing; `src/` does display and the enhancers.
- **Effort**: Medium.
- **Tradeoffs**: + fast native parsing, + HTML is sanitised before it reaches the webview. − `==highlight==`, abbreviations, emoji shortcodes and line-accurate outline/source mapping need custom Rust code or are missing. − Rendering is split across two languages, so each feature touches both.
- **Compatibility**: N/A (greenfield).

<!-- -->

> **✎ Notes** · `SPEC › Option A: Render in Rust with comrak (Conservative)`
> _(your notes here — replace this line)_

### Option B: Render in the webview with markdown-it (Recommended)

- **Description**: The core only reads and watches files. The webview turns Markdown into HTML with `markdown-it`, the parser behind many GitHub-style renderers, plus maintained plugins for every construct in scope: footnote, deflist, abbr, mark, sub, sup, emoji, task-lists, GitHub alerts, front matter, KaTeX math and wiki links. DOMPurify sanitises the output before it is inserted. Enhancers then add highlighting, Mermaid and the outline.
- **Scope**: `src/render/` holds the whole pipeline; `src-tauri/` stays a thin file and OS layer.
- **Effort**: Medium.
- **Tradeoffs**: + every D-7 feature is an existing plugin, so the work is configuration, not parsers. + One language for rendering, testable with fast unit tests outside the app. + The same pipeline can later power an editor's preview (S-3). − Parsing large files runs on the UI thread; a 1 MB document must stay within the `render_ms_1MB` bound, moving parsing to a Web Worker if it does not. − Plugin quality varies, so each one is pinned and covered by the feature fixture.
- **Compatibility**: N/A (greenfield).

<!-- -->

> **✎ Notes** · `SPEC › Option B: Render in the webview with markdown-it (Recommended)`
> _(your notes here — replace this line)_

### Option C: Bundle Pandoc

- **Description**: Call the Pandoc binary from the core to convert Markdown to HTML.
- **Scope**: `src-tauri/` plus a bundled Pandoc for each OS.
- **Effort**: Medium.
- **Tradeoffs**: + the widest syntax coverage of all. − Adds about 150 MB per platform. − Its dialect is not GitHub's, so D-7's parity yardstick would drift. − An external process for every render, and harder app-store review.
- **Compatibility**: N/A (greenfield).

<!-- -->

> **✎ Notes** · `SPEC › Option C: Bundle Pandoc`
> _(your notes here — replace this line)_

### Comparison

| | Option A (comrak) | Option B (markdown-it) | Option C (Pandoc) |
|---|---|---|---|
| Effort | Medium, plus custom work for missing extras | Medium | Medium |
| Risk | Medium: split pipeline | Low: proven plugins, one place | High: size, dialect drift |
| Completeness vs D-7 | Partial without custom code | Full from existing plugins | Full, but not GitHub-flavoured |
| Package size | Small | Small (+2 MB Mermaid) | Very large |
| Maintenance | Two languages per feature | One pipeline | External binary per OS |

<!-- -->

> **✎ Notes** · `SPEC › Comparison`
> _(your notes here — replace this line)_

## §4 Recommendation

**Recommended option**: Option B (markdown-it in the webview). It covers every construct in
D-7 with maintained plugins. It keeps rendering in one testable place, keeps the Rust core
thin, and the same pipeline can serve the editor later (S-3). If the 1 MB bound fails,
parsing moves to a Web Worker; that fix stays within Option B.

**Immediate next action**: after this spec is approved, run `design`. It defines the Tauri
command contract and the module layout, then splits the work into tasks. The first task
scaffolds Tauri v2 + Vite + TypeScript with CI, so the arsenal's `host-gate` and
`preflight-gate` can be set to real commands (`make lint test`, and its change-scoped
slice).

**Open questions**: none. The four raised in r1 were answered in review and are recorded
as D-12 to D-15.

- [x] **Remote images**: loaded by default, with a setting to turn them off (D-12).
- [x] **drawspec**: documents embed drawspec's rendered SVG/PNG; Glossmark only themes inlinable SVGs (D-13).
- [x] **UI language**: English in v1; translations later (D-14).
- [x] **Raw HTML**: safe tags kept, as on GitHub (D-15).

**Decisions log** (carried unchanged from `explore-idea`):

| ID | Decision | Status | Date |
|----|----------|--------|------|
| D-1 | Name: Glossmark | agreed | 2026-10-26 |
| D-2 | Stack: Tauri v2 (system webview, small Rust backend) | agreed | 2026-10-26 |
| D-3 | v1 is a viewer only; editing comes later (S-3) | agreed | 2026-10-26 |
| D-4 | Linux first, then Windows and macOS | agreed | 2026-10-26 |
| D-5 | Mermaid is in v1, lazy-loaded (S-2 folded into S-1) | agreed | 2026-10-26 |
| D-6 | Page layout: a fixed-width paper sheet on a grey canvas, continuous scroll; print uses the same styling | agreed | 2026-10-26 |
| D-7 | Feature yardstick: GitHub parity (GFM, footnotes, alerts, emoji, KaTeX, Mermaid) plus extras (highlight, sup/sub, wiki links, abbreviations, definition lists) | agreed | 2026-10-26 |
| D-8 | Navigation: tabs, with back/forward per tab; links to `.md` open in place, external links open in the browser; folder sidebar later | agreed | 2026-10-26 |
| D-9 | Look: one signature theme (light + dark) plus optional user CSS; themes are plain swappable stylesheets so a remembered theme picker can follow | agreed | 2026-10-26 |
| D-10 | Licence: MIT | agreed | 2026-10-26 |
| D-11 | Simplicity is the signature: the document is the interface; no feature may make the window busier. Reference: Chrome's PDF viewer, one slim bar | agreed | 2026-10-26 |
| D-12 | Remote images load by default, with a setting to turn them off | agreed | 2026-10-26 |
| D-13 | drawspec diagrams arrive as rendered SVG/PNG files; local SVGs are inlined so they follow the theme; drawspec fences show as code | agreed | 2026-10-26 |
| D-14 | UI in English for v1, all strings in one file; translations later | agreed | 2026-10-26 |
| D-15 | Safe raw HTML is kept, as on GitHub; everything else is stripped | agreed | 2026-10-26 |


> Sections 5–6 (contracts, risks) are appended by `design`.

<!-- -->

> **✎ Notes** · `SPEC §4`
> _(your notes here — replace this line)_

