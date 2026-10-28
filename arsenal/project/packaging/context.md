# packaging: Context

Glossmark (Tauri v2 Markdown viewer) ships today only as a Linux .deb/AppImage CI artifact. This workspace makes it installable and current on Linux, Windows and macOS for free (no paid signing, no Apple Developer program; D-24).

One `release.yml` builds each OS once on a `vX.Y.Z` tag and publishes a GitHub Release. Channel jobs then repackage those assets: Homebrew tap, winget, signed apt repo on GitHub Pages, Snap, Flathub (D-26, D-27). The Tauri updater runs in every self-replacing build, winget and Homebrew included, and is off under Flatpak, Snap and /usr installs (D-31). Export to PDF must work on Windows (WebView2 PrintToPdf) and macOS (paginated NSPrintOperation, not createPDF) before those builds ship (D-29). Windows ships unsigned until SignPath Foundation approves (D-25).

Secrets live only in Actions secrets. Spec: `arsenal/project/packaging/spec.md`. Decisions: `status/ideas.md` D-10, D-23..D-31.
