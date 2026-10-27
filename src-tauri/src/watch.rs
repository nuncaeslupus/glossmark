use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Reference counts for watched files. The folder is what gets watched, not the file: editors
/// that save by writing a new file and renaming it over the old one would end a file watch.
#[derive(Debug, Default)]
pub struct Registry {
    files: HashMap<PathBuf, usize>,
    folders: HashMap<PathBuf, usize>,
}

impl Registry {
    /// Counts one more watcher of `file`; returns its folder when that folder needs a watch.
    pub fn add(&mut self, file: &Path) -> Option<PathBuf> {
        let count = self.files.entry(file.to_path_buf()).or_default();
        *count += 1;
        if *count > 1 {
            return None;
        }
        let folder = file.parent()?.to_path_buf();
        let count = self.folders.entry(folder.clone()).or_default();
        *count += 1;
        (*count == 1).then_some(folder)
    }

    /// Counts one fewer watcher of `file`; returns its folder when that folder's watch can end.
    pub fn remove(&mut self, file: &Path) -> Option<PathBuf> {
        let count = self.files.get_mut(file)?;
        *count -= 1;
        if *count > 0 {
            return None;
        }
        self.files.remove(file);
        let folder = file.parent()?.to_path_buf();
        let count = self.folders.get_mut(&folder)?;
        *count -= 1;
        if *count > 0 {
            return None;
        }
        self.folders.remove(&folder);
        Some(folder)
    }

    pub fn contains(&self, file: &Path) -> bool {
        self.files.contains_key(file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_watch_is_reference_counted_per_path() {
        let mut reg = Registry::default();
        let a = Path::new("/n/a.md");
        let b = Path::new("/n/b.md");
        let dir = Some(PathBuf::from("/n"));

        assert_eq!(reg.add(a), dir);
        assert_eq!(reg.add(a), None);
        assert_eq!(reg.add(b), None);
        assert_eq!(reg.remove(a), None);
        assert!(reg.contains(a));
        assert_eq!(reg.remove(a), None);
        assert!(!reg.contains(a));
        assert_eq!(reg.remove(a), None);
        assert_eq!(reg.remove(b), dir);
        assert_eq!(reg.add(b), dir);
    }
}
