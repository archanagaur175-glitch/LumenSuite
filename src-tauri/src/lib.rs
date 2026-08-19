use std::sync::Mutex;

mod convert;
mod engine;
mod result;

pub use engine::EngineState;

use convert::{app_dirs, convert_file, ConvertLock};
use engine::{engine_shutdown, engine_start, engine_status};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(EngineState::default())
        .manage(ConvertLock(Mutex::new(())))
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            engine_status,
            engine_start,
            engine_shutdown,
            convert_file,
            app_dirs
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lumen Suite");
}
