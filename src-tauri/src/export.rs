//! File › Export (D-20): the page printed with its print styling straight to a PDF file.

use crate::error::{ErrorKind, IpcError};
use std::path::{Path, PathBuf};
use tauri::{Runtime, WebviewWindow};

/// The Save dialog's answer, with `.pdf` added when the user typed a name without it.
pub fn with_pdf_extension(path: PathBuf) -> PathBuf {
    if is_pdf(&path) {
        return path;
    }
    let mut name = path.into_os_string();
    name.push(".pdf");
    name.into()
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
}

/// Only the Save dialog's last answer may be written, and only as a PDF.
pub fn target(picked: Option<PathBuf>, path: &str) -> Result<PathBuf, IpcError> {
    let path = PathBuf::from(path);
    if !is_pdf(&path) || picked.as_ref() != Some(&path) {
        return Err(IpcError::new(
            ErrorKind::NotPermitted,
            format!("{} was not chosen in the Export dialog", path.display()),
        ));
    }
    Ok(path)
}

/// WebKitGTK's print operation with "Print to File" settings: no dialog, the same page Print
/// shows. Returns once the file is written.
#[cfg(target_os = "linux")]
pub fn print_to_pdf<R: Runtime>(window: &WebviewWindow<R>, path: &Path) -> Result<(), IpcError> {
    use std::cell::RefCell;
    use std::rc::Rc;
    use webkit2gtk::PrintOperationExt;

    let failed = |message: String| IpcError::new(ErrorKind::Io, message);
    let uri = url::Url::from_file_path(path)
        .map_err(|()| failed(format!("{} is not an absolute path", path.display())))?
        .to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .with_webview(move |webview| {
            let settings = gtk::PrintSettings::new();
            // GTK names its file printer in the desktop's language.
            let printer = webkit2gtk::glib::dgettext(Some("gtk30"), "Print to File");
            settings.set_printer(&printer);
            settings.set(gtk::PRINT_SETTINGS_OUTPUT_FILE_FORMAT, Some("pdf"));
            settings.set(gtk::PRINT_SETTINGS_OUTPUT_URI, Some(&uri));
            let op = webkit2gtk::PrintOperation::new(&webview.inner());
            op.set_print_settings(&settings);
            let on_fail = tx.clone();
            op.connect_failed(move |_, err| {
                let _ = on_fail.send(Err(err.to_string()));
            });
            // The operation stays alive until it finishes; emptying the slot then frees it.
            let alive = Rc::new(RefCell::new(Some(op.clone())));
            op.connect_finished(move |_| {
                alive.borrow_mut().take();
                let _ = tx.send(Ok(()));
            });
            op.print();
        })
        .map_err(|e| failed(e.to_string()))?;
    // `failed` comes before `finished`, so the first message is the outcome.
    rx.recv()
        .map_err(|e| failed(e.to_string()))?
        .map_err(failed)
}

/// WebView2's `PrintToPdf` (D-29): A4 portrait with backgrounds, the page margins from
/// `print.css`. Returns once the file is written.
#[cfg(windows)]
pub fn print_to_pdf<R: Runtime>(window: &WebviewWindow<R>, path: &Path) -> Result<(), IpcError> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::{Interface, HSTRING};

    let failed = |message: String| IpcError::new(ErrorKind::Io, message);
    let file = HSTRING::from(path.as_os_str());
    let shown = path.display().to_string();
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .with_webview(move |webview| {
            let done = tx.clone();
            let started = (|| unsafe {
                let core = webview
                    .controller()
                    .CoreWebView2()?
                    .cast::<ICoreWebView2_7>()?;
                let settings = webview
                    .environment()
                    .cast::<ICoreWebView2Environment6>()?
                    .CreatePrintSettings()?;
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                // A4, in inches.
                settings.SetPageWidth(8.27)?;
                settings.SetPageHeight(11.69)?;
                settings.SetShouldPrintBackgrounds(true)?;
                settings.SetShouldPrintHeaderAndFooter(false)?;
                let handler =
                    PrintToPdfCompletedHandler::create(Box::new(move |result, written| {
                        let _ = done.send(match result {
                            Err(e) => Err(e.to_string()),
                            Ok(()) if !written => Err(format!("{shown} could not be written")),
                            Ok(()) => Ok(()),
                        });
                        Ok(())
                    }));
                core.PrintToPdf(&file, &settings, &handler)
            })();
            if let Err(e) = started {
                let _ = tx.send(Err(e.to_string()));
            }
        })
        .map_err(|e| failed(e.to_string()))?;
    rx.recv()
        .map_err(|e| failed(e.to_string()))?
        .map_err(failed)
}

#[cfg(not(any(target_os = "linux", windows)))]
pub fn print_to_pdf<R: Runtime>(_: &WebviewWindow<R>, _: &Path) -> Result<(), IpcError> {
    // ponytail: Linux and Windows first (D-4, D-29); macOS prints to PDF through WKWebView.
    Err(IpcError::new(
        ErrorKind::Io,
        "Export to PDF is not available on this platform yet",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_export_rejects_a_path_without_pdf() {
        let picked = Some(PathBuf::from("/out/notes.txt"));
        let err = target(picked, "/out/notes.txt").unwrap_err();
        assert_eq!(err.kind, ErrorKind::NotPermitted);
    }

    #[test]
    fn test_export_writes_only_the_dialogs_answer() {
        let picked = || Some(PathBuf::from("/out/notes.pdf"));
        assert_eq!(
            target(picked(), "/out/notes.pdf").unwrap(),
            PathBuf::from("/out/notes.pdf")
        );
        assert!(target(picked(), "/etc/other.pdf").is_err());
        assert!(target(None, "/out/notes.pdf").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn test_export_target_rules_hold_on_windows() {
        let picked = || Some(PathBuf::from(r"C:\out\notes.pdf"));
        assert!(target(picked(), r"C:\out\notes.pdf").is_ok());
        assert!(target(picked(), r"C:\out\other.pdf").is_err());
        assert!(target(
            Some(PathBuf::from(r"C:\out\notes.txt")),
            r"C:\out\notes.txt"
        )
        .is_err());
        assert_eq!(
            with_pdf_extension(PathBuf::from(r"C:\out\notes")),
            PathBuf::from(r"C:\out\notes.pdf")
        );
    }

    #[test]
    fn test_export_adds_pdf_to_a_bare_name() {
        let add = |p: &str| with_pdf_extension(PathBuf::from(p));
        assert_eq!(add("/out/notes"), PathBuf::from("/out/notes.pdf"));
        assert_eq!(add("/out/my.notes"), PathBuf::from("/out/my.notes.pdf"));
        assert_eq!(add("/out/a.PDF"), PathBuf::from("/out/a.PDF"));
    }
}
