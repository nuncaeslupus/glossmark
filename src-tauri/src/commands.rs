use crate::config::{self, Config, UserCss};
use crate::document::{self, Document, DocumentChanged};
use crate::error::{ErrorKind, IpcError};
use crate::external;
use crate::scope::{self, Scope};
use crate::watch::Registry;
use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use std::collections::BTreeSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    scope: Mutex<Scope>,
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
        let (handle, registry) = (app.clone(), watched.clone());
        let debouncer = new_debouncer(
            Duration::from_millis(100),
            move |res: DebounceEventResult| {
                let Ok(events) = res else { return };
                let paths: BTreeSet<PathBuf> = {
                    let registry = lock(&registry);
                    events
                        .into_iter()
                        .map(|e| e.path)
                        .filter(|p| registry.contains(p))
                        .collect()
                };
                for path in paths {
                    let _ = handle.emit("document-changed", DocumentChanged::of(&path));
                }
            },
        )?;

        let mut scope = Scope::default();
        for recent in config::load(&config_dir.join("config.json")).recent_files {
            scope.allow(Path::new(&recent));
        }
        Ok(Self {
            scope: Mutex::new(scope),
            watched,
            debouncer: Mutex::new(debouncer),
            pending: Mutex::new(Vec::new()),
            config_dir,
        })
    }

    /// Brings opened files into scope and returns their canonical paths.
    pub fn open<P: AsRef<Path>>(&self, paths: impl IntoIterator<Item = P>) -> Vec<String> {
        let mut scope = lock(&self.scope);
        paths
            .into_iter()
            .filter_map(|p| scope.allow(p.as_ref()))
            .map(|p| p.display().to_string())
            .collect()
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
    let picked = app
        .dialog()
        .file()
        .add_filter("Markdown", &scope::MARKDOWN_EXTENSIONS)
        .blocking_pick_files()
        .unwrap_or_default();
    let paths = picked.into_iter().filter_map(|p| p.into_path().ok());
    Ok(OpenFiles {
        paths: state.open(paths),
    })
}

#[tauri::command]
pub async fn read_document(path: String, state: State<'_, AppState>) -> Result<Document, IpcError> {
    // The scope lock covers only the check; the read itself runs without it.
    let path = lock(&state.scope).check_document(Path::new(&path))?;
    document::read_file(&path)
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
