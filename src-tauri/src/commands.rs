use crate::config::{self, Config, UserCss};
use crate::document::{self, Document, Svg};
use crate::error::{ErrorKind, IpcError};
use crate::external;
use crate::scope::{self, Scope};
use crate::watch::{self, Registry};
use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::Debouncer;
use serde::Serialize;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::scope::fs::Scope as AssetScope;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    scope: Mutex<Scope>,
    assets: AssetScope,
    watched: Arc<Mutex<Registry>>,
    debouncer: Mutex<Debouncer<RecommendedWatcher>>,
    pending: Mutex<Vec<String>>,
    config_dir: PathBuf,
}

/// Payload of the `open-files` event.
#[derive(Debug, Clone, Serialize)]
pub struct OpenFiles {
    pub paths: Vec<String>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl AppState {
    pub fn new<R: Runtime>(app: &AppHandle<R>) -> Result<Self, Box<dyn std::error::Error>> {
        let config_dir = config::config_dir().ok_or("no config folder")?;
        let watched = Arc::new(Mutex::new(Registry::default()));
        let handle = app.clone();
        let debouncer = watch::debouncer(watched.clone(), move |changed| {
            let _ = handle.emit("document-changed", changed);
        })?;

        let assets = app.asset_protocol_scope();
        let mut scope = Scope::default();
        for recent in config::load(&config_dir.join("config.json")).recent_files {
            if let Some(path) = scope.allow(Path::new(&recent)) {
                allow_assets(&assets, [path]);
            }
        }
        Ok(Self {
            scope: Mutex::new(scope),
            assets,
            watched,
            debouncer: Mutex::new(debouncer),
            pending: Mutex::new(Vec::new()),
            config_dir,
        })
    }

    /// Brings opened files into scope and returns their canonical paths.
    pub fn open<P: AsRef<Path>>(&self, paths: impl IntoIterator<Item = P>) -> Vec<String> {
        let paths = open_in_scope(&mut lock(&self.scope), paths);
        allow_assets(&self.assets, &paths);
        paths
    }

    /// Dropped files: the `open-files` payload for those the scope accepted, if any.
    pub fn dropped(&self, paths: &[PathBuf]) -> Option<OpenFiles> {
        let files = dropped_files(&mut lock(&self.scope), paths)?;
        allow_assets(&self.assets, &files.paths);
        Some(files)
    }

    /// Files from this launch's command line, held until the frontend asks for them.
    pub fn open_at_launch<S: AsRef<OsStr>>(&self, args: impl IntoIterator<Item = S>, cwd: &Path) {
        let paths = self.open(document::paths_from_args(args, cwd));
        lock(&self.pending).extend(paths);
    }

    fn config_path(&self) -> PathBuf {
        self.config_dir.join("config.json")
    }
}

/// Opens the folders of files just brought into `Scope` (recursively, like its folders) to the
/// asset protocol, so their documents' local images load through `convertFileSrc`.
// ponytail: the asset protocol serves any file type under that folder, not only images; only
// `<img>` reaches it (CSP `script-src 'self'`, sanitised documents), so nothing can read it back.
fn allow_assets<P: AsRef<Path>>(assets: &AssetScope, opened: impl IntoIterator<Item = P>) {
    for path in opened {
        if let Some(folder) = path.as_ref().parent() {
            // Fails only on a path that is not a valid glob pattern; the images then show broken.
            let _ = assets.allow_directory(folder, true);
        }
    }
}

/// A second launch forwards its arguments here (single instance).
pub fn open_from_second_instance<R: Runtime>(app: &AppHandle<R>, argv: Vec<String>, cwd: String) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let paths = state.open(document::paths_from_args(
        argv.iter().skip(1),
        Path::new(&cwd),
    ));
    let _ = app.emit("open-files", OpenFiles { paths });
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

// ponytail: `open-files` emitted during setup would arrive before the frontend listens, so the
// launch's own files are fetched once with this command instead.
#[tauri::command]
pub fn take_open_files(state: State<'_, AppState>) -> OpenFiles {
    OpenFiles {
        paths: std::mem::take(&mut *lock(&state.pending)),
    }
}

/// File › Open. The native dialog runs here rather than in the frontend, so only files the user
/// picked enter the scope; the frontend holds no dialog permission. Cancelling gives no paths.
#[tauri::command]
pub async fn open_dialog<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
) -> Result<OpenFiles, IpcError> {
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Markdown", &scope::MARKDOWN_EXTENSIONS);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    let picked = dialog.blocking_pick_files().unwrap_or_default();
    let files = picked_files(&mut lock(&state.scope), picked);
    allow_assets(&state.assets, &files.paths);
    Ok(files)
}

/// Brings files into `scope` and returns the canonical paths it accepted.
fn open_in_scope<P: AsRef<Path>>(
    scope: &mut Scope,
    paths: impl IntoIterator<Item = P>,
) -> Vec<String> {
    paths
        .into_iter()
        .filter_map(|p| scope.allow(p.as_ref()))
        .map(|p| p.display().to_string())
        .collect()
}

/// The dialog's picks enter the scope before they are returned; non-file URLs are dropped.
fn picked_files(scope: &mut Scope, picked: Vec<FilePath>) -> OpenFiles {
    let paths = picked.into_iter().filter_map(|p| p.into_path().ok());
    OpenFiles {
        paths: open_in_scope(scope, paths),
    }
}

/// Only the paths the scope accepted are emitted, and nothing when it accepted none.
fn dropped_files(scope: &mut Scope, paths: &[PathBuf]) -> Option<OpenFiles> {
    let paths = open_in_scope(scope, paths);
    (!paths.is_empty()).then_some(OpenFiles { paths })
}

#[tauri::command]
pub async fn read_document(path: String, state: State<'_, AppState>) -> Result<Document, IpcError> {
    // The scope lock covers only the check; the read itself runs without it.
    let path = lock(&state.scope).check_document(Path::new(&path))?;
    document::read_file(&path)
}

#[tauri::command]
pub async fn read_svg(path: String, state: State<'_, AppState>) -> Result<Svg, IpcError> {
    let path = lock(&state.scope).check_svg(Path::new(&path))?;
    document::read_svg_file(&path)
}

#[tauri::command]
pub fn watch(path: String, state: State<'_, AppState>) -> Result<(), IpcError> {
    let path = lock(&state.scope).check_document(Path::new(&path))?;
    let Some(folder) = lock(&state.watched).add(&path) else {
        return Ok(());
    };
    let result = lock(&state.debouncer)
        .watcher()
        .watch(&folder, RecursiveMode::NonRecursive);
    result.map_err(|e| {
        lock(&state.watched).remove(&path);
        IpcError::new(ErrorKind::Io, format!("{}: {e}", folder.display()))
    })
}

#[tauri::command]
pub fn unwatch(path: String, state: State<'_, AppState>) {
    let Some(path) = scope::resolve(Path::new(&path)) else {
        return;
    };
    let folder = lock(&state.watched).remove(&path);
    if let Some(folder) = folder {
        let _ = lock(&state.debouncer).watcher().unwatch(&folder);
    }
}

#[tauri::command]
pub fn get_config(state: State<'_, AppState>) -> Config {
    config::load(&state.config_path())
}

#[tauri::command]
pub fn set_config(mut config: Config, state: State<'_, AppState>) -> Result<(), IpcError> {
    // Recent files grant read access at the next launch, so only opened files may be stored.
    let scope = lock(&state.scope);
    config
        .recent_files
        .retain(|p| scope.is_opened(Path::new(p)));
    drop(scope);
    config::save(&state.config_path(), &config.normalized())
}

#[tauri::command]
pub fn read_user_css(state: State<'_, AppState>) -> Result<UserCss, IpcError> {
    config::read_user_css(&state.config_dir.join("user.css"))
}

#[tauri::command]
pub fn open_external(url: String, app: AppHandle) -> Result<(), IpcError> {
    let url = external::check_url(&url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| IpcError::new(ErrorKind::Io, e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_open_dialog_picks_enter_scope_before_return() {
        let dir = tempfile::tempdir().unwrap();
        let dir = fs::canonicalize(dir.path()).unwrap();
        let doc = dir.join("a.md");
        fs::write(&doc, "# a").unwrap();
        let mut scope = Scope::default();
        assert!(scope.check_document(&doc).is_err());

        let picked = vec![
            FilePath::Path(doc.clone()),
            FilePath::Url("https://a.org/x.md".parse().unwrap()),
            FilePath::Path(dir.clone()),
        ];
        let opened = picked_files(&mut scope, picked);
        assert_eq!(opened.paths, [doc.display().to_string()]);
        assert!(scope.is_opened(&doc));
        assert!(picked_files(&mut scope, Vec::new()).paths.is_empty());
    }

    #[test]
    fn test_drop_emits_only_accepted_paths() {
        let dir = tempfile::tempdir().unwrap();
        let dir = fs::canonicalize(dir.path()).unwrap();
        let doc = dir.join("a.md");
        fs::write(&doc, "# a").unwrap();
        let mut scope = Scope::default();

        let dropped = [dir.clone(), PathBuf::from("rel.md"), doc.clone()];
        let event = dropped_files(&mut scope, &dropped).unwrap();
        assert_eq!(event.paths, [doc.display().to_string()]);
        assert!(scope.is_opened(&doc));
        assert!(dropped_files(&mut scope, std::slice::from_ref(&dir)).is_none());
    }
}
