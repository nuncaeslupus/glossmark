mod commands;
mod config;
mod document;
mod error;
mod export;
mod external;
mod image;
mod scope;
mod watch;

use commands::AppState;
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
                    if let Some(files) = state.dropped(paths) {
                        let _ = window.emit("open-files", files);
                    }
                }
            }
        })
        .register_asynchronous_uri_scheme_protocol(image::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_owned();
            // Reads off the webview's thread.
            tauri::async_runtime::spawn_blocking(move || {
                if let Some(state) = app.try_state::<AppState>() {
                    responder.respond(state.image(&path));
                }
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::take_open_files,
            commands::open_dialog,
            commands::save_dialog,
            commands::export_pdf,
            commands::read_document,
            commands::read_svg,
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
