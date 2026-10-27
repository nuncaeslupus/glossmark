# Ideas backlog

## Groups

### A. Reading experience
- Open a `.md` file and see it as a beautifully typeset page, like a PDF reader  (I-1)
- Render every common Markdown feature correctly: CommonMark + GFM (tables, task lists, strikethrough, autolinks)  (I-2)
- Syntax-highlighted code blocks  (I-3)
- Math with KaTeX  (I-4)
- Footnotes, definition lists, front-matter display  (I-5)
- Outline / table-of-contents sidebar built from the headings  (I-6)
- Live reload when the file changes on disk  (I-7)
- Light and dark themes, zoom  (I-8)
- Print / export to PDF  (I-9)
- A signature theme: book-like serif body, sans headings, bundled fonts, light + dark, optional user CSS file  (I-21)
- Later: a theme picker — choose once, remembered  (I-22)
- Later: UI translations into other languages  (I-23)
- Recent files, menus and a simple toolbar  (I-10)
- Tabs: several documents per window; links to `.md` open in the current tab, Ctrl/middle-click opens a new one; back/forward per tab  (I-18)
- Open by file association, drag-and-drop and `glossmark <file>` from a terminal  (I-19)
- Later: a folder sidebar to browse a directory of `.md` files  (I-20)

### B. Diagrams
- Render Mermaid diagrams inside documents  (I-11)

### F. Syntax beyond GitHub
- GitHub alerts (`> [!NOTE]`), emoji shortcodes  (I-16)
- Extras: `==highlight==`, `^sup^` / `~sub~`, `[[wiki links]]`, abbreviations, definition lists  (I-17)

### C. Editing
- Edit Markdown files in the app, later  (I-12)

### D. Distribution
- Free, public GitHub repo, open-source licence  (I-13)
- Packages for Linux (AppImage/deb/Flatpak/Snap), Windows (.msi / Microsoft Store) and macOS (.dmg / App Store)  (I-14)
- Later: a logo (app icon) and a hero image for the README  (I-38)

### E. Project documentation
- Diagrams in the project's own docs drawn with the owner's drawspec  (I-15)

### G. Toolbar and view (owner review during T17, 2026-10-27)
- Zoom: scale the whole page like a PDF viewer, or only the text size?  (I-24)
- Menus in a row of their own; tool icons centred, Export and Print maybe on the right, Find's place undecided  (I-25)
- An Export option next to Print  (I-26)
- Search and Print icons: use the familiar ones (as in Chrome's PDF viewer), not custom ones  (I-27)
- Switch tabs from the keyboard: Ctrl+Tab / Ctrl+Shift+Tab  (I-28)
- Toolbar order: Back/Forward on the left, zoom (and maybe Find) in the centre, Export and Print on the right  (I-29)

### H. GitHub parity gaps (owner comparison during T17, 2026-10-27)
- Bug: an `<img height="150">` (Mermaid README logo) renders page-wide; `height: auto` in signature.css overrides the attribute  (I-30)
- An image in the GitHub Issues part renders too small  (I-31)
- Gantt charts too compressed vertically  (I-32)
- Mermaid diagrams: zoom and pan controls, as on GitHub  (I-33)
- Front matter: GitHub shows it as a vertical (key/value) table, ours is horizontal  (I-34)
- Code copy button: GitHub's two-squares icon, always visible  (I-35)
- Heading anchors: appear when hovering their own spot, GitHub's chain icon  (I-36)
- Body text in sans-serif (owner preference; revisits the serif signature theme, I-21)  (I-37)

## Sub-projects

| ID  | Name                 | Groups | Status    | Spec section |
|-----|----------------------|--------|-----------|--------------|
| S-1 | Viewer v1            | A, B, E, F | specified | status/specification.md |
| S-2 | Diagram rendering    | B      | dropped   |              |
| S-3 | Editing              | C      | parked    |              |
| S-4 | Packaging and stores | D      | parked    |              |

## Decision log

| ID  | Decision                                                     | Status | Date       | Sub-project |
|-----|--------------------------------------------------------------|--------|------------|-------------|
| D-1 | Name: Glossmark                                              | agreed | 2026-10-26 | S-1         |
| D-2 | Stack: Tauri v2 (system webview, small Rust backend)         | agreed | 2026-10-26 | S-1         |
| D-3 | v1 is a viewer only; editing comes later (S-3)               | agreed | 2026-10-26 | S-1         |
| D-4 | Linux first, then Windows and macOS                          | agreed | 2026-10-26 | S-1         |
| D-5 | Mermaid is in v1, lazy-loaded (S-2 folded into S-1)          | agreed | 2026-10-26 | S-1         |
| D-6 | Page layout: a fixed-width paper sheet on a grey canvas, continuous scroll; print uses the same styling | agreed | 2026-10-26 | S-1 |
| D-7 | Feature yardstick: GitHub parity (GFM, footnotes, alerts, emoji, KaTeX, Mermaid) plus extras (highlight, sup/sub, wiki links, abbreviations, definition lists) | agreed | 2026-10-26 | S-1 |
| D-8 | Navigation: tabs, with back/forward per tab; links to `.md` open in place, external links open in the browser; folder sidebar later | agreed | 2026-10-26 | S-1 |
| D-9 | Look: one signature theme (light + dark) plus optional user CSS; themes are plain swappable stylesheets so a remembered theme picker can follow | agreed | 2026-10-26 | S-1 |
| D-10 | Licence: MIT                                                | agreed | 2026-10-26 | S-4         |
| D-11 | Simplicity is the signature: the document is the interface; no feature may make the window busier. Reference: Chrome's PDF viewer, one slim bar | agreed | 2026-10-26 | S-1 |
| D-12 | Remote images load by default, with a setting to turn them off | agreed | 2026-10-26 | S-1 |
| D-13 | drawspec diagrams arrive as rendered SVG/PNG; local SVGs are inlined so they follow the theme; drawspec fences show as code | agreed | 2026-10-26 | S-1 |
| D-14 | UI in English for v1, all strings in one file; translations later | agreed | 2026-10-26 | S-1 |
| D-15 | Safe raw HTML is kept, as on GitHub; everything else is stripped | agreed | 2026-10-26 | S-1 |
| D-18 | Zoom scales the whole sheet like a PDF viewer (I-24): already so (`zoom` on `.sheet`), no task | agreed | 2026-10-28 | S-1 |
| D-19 | One bar in three zones (I-25, I-29): left ☰ outline, title, Back/Forward · centre zoom − % + and Find · right Export, Print, ⋮ More; the File/View/Go/Help menus fold into ⋮ More (Chrome's PDF viewer, D-11) | agreed | 2026-10-28 | S-1 |
| D-20 | Export (I-26) saves a PDF of the print styling to a chosen file; no HTML export | agreed | 2026-10-28 | S-1 |
| D-21 | Find and Print use the familiar icons, Material Symbols as in Chrome's PDF viewer (I-27) | agreed | 2026-10-28 | S-1 |
| D-22 | Ctrl+Tab / Ctrl+Shift+Tab switch to the next / previous tab (I-28) | agreed | 2026-10-28 | S-1 |
| D-23 | A simple SVG logo, the app icons generated from it, and a README hero screenshot (I-38); owner approves the look | agreed | 2026-10-28 | S-4 |
