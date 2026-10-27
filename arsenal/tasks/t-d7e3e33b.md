---
id: t-d7e3e33b
title: "Export the document to a PDF file"
label: "export to PDF"
priority: 5
deps: [t-186086e7]
tags: [UI]
---

An Export button (right zone, next to Print, D-19) and File › Export… in ⋮ More save a PDF of the print styling to a file the user picks (D-20, status/ideas.md I-26), default name the document's with .pdf. No HTML export. Print already renders print.css through the system dialog; Export prints the same page straight to the chosen file (WebKitGTK print operation with an output-file setting, on the Rust side). Write `test_export_asks_for_a_path_and_saves_pdf` in `src/ui/shell.test.ts` (the action asks the backend for a save path, then calls export with it; cancel does nothing) and a Rust test that the command rejects a path without .pdf, first.

## Acceptance gate

```bash
npm test -- src/ui/shell.test.ts -t "test_export_asks_for_a_path_and_saves_pdf" && cargo test --manifest-path src-tauri/Cargo.toml export
```
