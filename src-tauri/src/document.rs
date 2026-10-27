use crate::error::{ErrorKind, IpcError};
use crate::scope::Scope;
use serde::Serialize;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const MAX_DOCUMENT_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct Document {
    pub path: String,
    pub text: String,
    pub mtime_ms: u64,
}

/// Payload of the `document-changed` event.
#[derive(Debug, Clone, Serialize)]
pub struct DocumentChanged {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mtime_ms: Option<u64>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub deleted: bool,
}

impl DocumentChanged {
    pub fn of(path: &Path) -> Self {
        let mtime_ms = fs::metadata(path).ok().map(|m| mtime_ms(&m));
        Self {
            path: path.display().to_string(),
            deleted: mtime_ms.is_none(),
            mtime_ms,
        }
    }
}

pub fn read_document(scope: &Scope, path: &Path) -> Result<Document, IpcError> {
    let path = scope.check_document(path)?;
    let meta = fs::metadata(&path).map_err(|e| IpcError::from_io(&e, &path))?;
    if meta.len() > MAX_DOCUMENT_BYTES {
        return Err(IpcError::new(
            ErrorKind::TooLarge,
            format!("{} is over 20 MB", path.display()),
        ));
    }
    let bytes = fs::read(&path).map_err(|e| IpcError::from_io(&e, &path))?;
    Ok(Document {
        path: path.display().to_string(),
        text: String::from_utf8_lossy(&bytes).into_owned(),
        mtime_ms: mtime_ms(&meta),
    })
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

/// Absolute paths from command-line arguments, resolved against `cwd`; flags are skipped.
pub fn paths_from_args<I, S>(args: I, cwd: &Path) -> Vec<PathBuf>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    // ponytail: no `file://` URIs; the .desktop entry passes plain paths (%F).
    args.into_iter()
        .map(|a| Path::new(a.as_ref()).to_path_buf())
        .filter(|p| !p.to_string_lossy().starts_with('-'))
        .map(|p| cwd.join(p))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_document_decodes_invalid_utf8_lossily_and_caps_size() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("a.md");
        fs::write(&doc, b"ok \xff").unwrap();
        let mut scope = Scope::default();
        scope.allow(&doc).unwrap();
        assert_eq!(read_document(&scope, &doc).unwrap().text, "ok \u{fffd}");

        let big = dir.path().join("big.md");
        fs::File::create(&big)
            .unwrap()
            .set_len(MAX_DOCUMENT_BYTES + 1)
            .unwrap();
        assert_eq!(
            read_document(&scope, &big).unwrap_err().kind,
            ErrorKind::TooLarge
        );
    }

    #[test]
    fn test_paths_from_args_resolves_relative_and_skips_flags() {
        let cwd = Path::new("/home/u");
        let paths = paths_from_args(["a.md", "--verbose", "/abs/b.md"], cwd);
        assert_eq!(
            paths,
            [Path::new("/home/u/a.md"), Path::new("/abs/b.md")].map(Path::to_path_buf)
        );
    }
}
