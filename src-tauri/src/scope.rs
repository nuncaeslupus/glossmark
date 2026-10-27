use crate::error::IpcError;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// What the frontend may read: the files the user opened, and Markdown files under their folders.
#[derive(Debug, Default)]
pub struct Scope {
    files: HashSet<PathBuf>,
    folders: HashSet<PathBuf>,
}

impl Scope {
    /// Records a file the user opened and returns its canonical path. A folder is refused.
    pub fn allow(&mut self, path: &Path) -> Option<PathBuf> {
        let path = resolve(path).filter(|p| !p.is_dir())?;
        self.folders.insert(path.parent()?.to_path_buf());
        self.files.insert(path.clone());
        Some(path)
    }

    pub fn is_opened(&self, path: &Path) -> bool {
        resolve(path).is_some_and(|p| self.files.contains(&p))
    }

    /// The canonical path of a document the frontend may read, or `not_permitted`.
    pub fn check_document(&self, path: &Path) -> Result<PathBuf, IpcError> {
        let resolved = resolve(path).ok_or_else(|| IpcError::not_permitted(path))?;
        if self.files.contains(&resolved) || (is_markdown(&resolved) && self.in_folders(&resolved))
        {
            Ok(resolved)
        } else {
            Err(IpcError::not_permitted(path))
        }
    }

    fn in_folders(&self, path: &Path) -> bool {
        path.ancestors().skip(1).any(|a| self.folders.contains(a))
    }
}

/// The canonical form of an absolute path, with `..` and symlinks resolved. A missing file
/// resolves through its parent folder, so it can still be in scope (and then `not_found`).
pub fn resolve(path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() {
        return None;
    }
    fs::canonicalize(path).ok().or_else(|| {
        let parent = fs::canonicalize(path.parent()?).ok()?;
        Some(parent.join(path.file_name()?))
    })
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::read_document;
    use crate::error::ErrorKind;

    #[test]
    fn test_read_document_outside_scope_not_permitted() {
        let root = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(root.path()).unwrap();
        let notes = root.join("notes");
        let secret = root.join("secret");
        fs::create_dir_all(notes.join("sub")).unwrap();
        fs::create_dir_all(&secret).unwrap();
        for p in [
            notes.join("readme.md"),
            notes.join("other.md"),
            notes.join("sub/deep.md"),
            notes.join("id_rsa"),
            secret.join("diary.md"),
        ] {
            fs::write(p, "# hi").unwrap();
        }

        let mut scope = Scope::default();
        scope.allow(&notes.join("readme.md")).unwrap();

        for ok in ["readme.md", "other.md", "sub/deep.md"] {
            assert!(read_document(&scope, &notes.join(ok)).is_ok(), "{ok}");
        }
        assert_eq!(
            read_document(&scope, &notes.join("missing.md"))
                .unwrap_err()
                .kind,
            ErrorKind::NotFound
        );

        let mut denied = vec![
            secret.join("diary.md"),
            secret.join("missing.md"),
            notes.join("id_rsa"),
            notes.join("../secret/diary.md"),
            notes.join("sub/../../secret/diary.md"),
            PathBuf::from("notes/readme.md"),
            notes.clone(),
        ];
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(secret.join("diary.md"), notes.join("link.md")).unwrap();
            std::os::unix::fs::symlink(&secret, notes.join("linkdir")).unwrap();
            denied.push(notes.join("link.md"));
            denied.push(notes.join("linkdir/diary.md"));
        }
        let allowed: Vec<_> = denied
            .iter()
            .filter(|p| !matches!(read_document(&scope, p), Err(e) if e.kind == ErrorKind::NotPermitted))
            .collect();
        assert!(
            allowed.is_empty(),
            "out_of_scope_reads_allowed: {allowed:?}"
        );
    }
}
