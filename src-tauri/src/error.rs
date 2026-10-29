use serde::Serialize;
use std::io;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    NotFound,
    NotPermitted,
    TooLarge,
    Io,
}

/// The error every IPC command returns: `{"kind": "...", "message": "..."}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct IpcError {
    pub kind: ErrorKind,
    pub message: String,
}

impl IpcError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn not_permitted(path: &Path) -> Self {
        Self::new(
            ErrorKind::NotPermitted,
            format!("{} is outside the opened folders", path.display()),
        )
    }

    /// A path whose folder is gone, such as a recent file in a folder renamed since.
    pub fn not_found(path: &Path) -> Self {
        Self::new(
            ErrorKind::NotFound,
            format!(
                "{} no longer exists; it may have been moved or renamed",
                path.display()
            ),
        )
    }

    pub fn from_io(err: &io::Error, path: &Path) -> Self {
        let kind = match err.kind() {
            io::ErrorKind::NotFound => ErrorKind::NotFound,
            io::ErrorKind::PermissionDenied => ErrorKind::NotPermitted,
            _ => ErrorKind::Io,
        };
        Self::new(kind, format!("{}: {err}", path.display()))
    }
}
