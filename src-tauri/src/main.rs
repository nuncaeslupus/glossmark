mod commands;
mod config;
mod document;
mod error;
mod external;
mod scope;
mod watch;

use commands::AppState;
use commands::OpenFiles;
use tauri::{DragDropEvent, Emitter, Manager, WindowEvent};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            commands::open_from_second_instance,
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = AppState::new(app.handle())?;
            let cwd = std::env::current_dir()?;
            state.open_at_launch(std::env::args_os().skip(1), &cwd);
            app.manage(state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                if let Some(state) = window.try_state::<AppState>() {
                    // Emitted after the scope grows, so the tabs' reads cannot race it.
                    let paths = state.open(paths);
                    let _ = window.emit("open-files", OpenFiles { paths });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::take_open_files,
            commands::open_dialog,
            commands::read_document,
            commands::watch,
            commands::unwatch,
            commands::get_config,
            commands::set_config,
            commands::read_user_css,
            commands::open_external,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glossmark");
}
