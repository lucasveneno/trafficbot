#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod engine;
use tauri::{Manager, Emitter, menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri_plugin_notification::NotificationExt;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Default)]
struct ExitGate(AtomicBool);

fn finish_quit(app: &tauri::AppHandle, code: i32) {
    app.state::<ExitGate>().0.store(true, Ordering::Release);
    app.exit(code);
}

#[tauri::command]
fn notify_important(app: tauri::AppHandle, message: String) -> Result<(), String> {
    if message.len() > 256 { return Err("Notification too long".into()); }
    app.notification().builder().title("Trafficbot").body(message).show().map_err(|_| "Notification unavailable".into())
}

#[tauri::command]
fn get_close_behavior() -> bool { engine::minimize_to_tray() }
#[tauri::command]
fn set_close_behavior(enabled: bool) -> Result<(), String> { engine::set_minimize_to_tray(enabled) }
#[tauri::command]
async fn connect_engine(app: tauri::AppHandle) -> Result<engine::Connection, String> {
    tauri::async_runtime::spawn_blocking(move || engine::connect(&app)).await.map_err(|_| "Engine task failed".to_string())?
}
#[tauri::command]
async fn stop_engine(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || engine::stop(&app)).await.map_err(|_| "Engine task failed".to_string())?
}
fn show(app: &tauri::AppHandle) { if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); } }
fn main() {
    tauri::Builder::default().manage(engine::Engine::default()).manage(ExitGate::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![connect_engine, stop_engine, notify_important, get_close_behavior, set_close_behavior])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open Trafficbot", true, None::<&str>)?;
            let start = MenuItem::with_id(app, "start", "Start / connect engine", true, None::<&str>)?;
            let stop = MenuItem::with_id(app, "stop", "Stop owned engine (when idle)", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pause campaigns", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit (when idle)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &start, &stop, &pause, &quit])?;
            let mut pixels = vec![0u8; 32 * 32 * 4];
            for y in 4..28 { for x in 4..28 { if x < 10 || (y > 12 && y < 19) { let i = (y * 32 + x) * 4; pixels[i..i+4].copy_from_slice(&[140,175,255,255]); } } }
            TrayIconBuilder::new().icon(tauri::image::Image::new_owned(pixels, 32, 32)).tooltip("Trafficbot").menu(&menu).on_menu_event(|app, event| {
                let action = event.id().as_ref().to_owned();
                if action == "open" { show(app); return; }
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let result = match action.as_str() { "start" => engine::connect(&app).map(|_| ()), "stop" | "quit" => engine::stop(&app), "pause" => engine::pause_campaigns(), _ => Ok(()) };
                    match result { Ok(()) if action == "quit" => finish_quit(&app, 0), Ok(()) => { let _ = app.emit("engine-changed", ()); }, Err(message) => { show(&app); let _ = app.emit("engine-error", message); } }
                });
            }).build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| { if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if engine::minimize_to_tray() { let _ = window.hide(); }
            else { let app = window.app_handle().clone(); tauri::async_runtime::spawn_blocking(move || { match engine::stop(&app) { Ok(()) => finish_quit(&app, 0), Err(message) => { show(&app); let _ = app.emit("engine-error", message); } } }); }
        } })
        .build(tauri::generate_context!()).expect("Unable to initialize Trafficbot")
        .run(|app, event| { if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
            if app.state::<ExitGate>().0.load(Ordering::Acquire) { return; }
            api.prevent_exit();
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || { match engine::stop(&app) { Ok(()) => finish_quit(&app, code.unwrap_or(0)), Err(message) => { show(&app); let _ = app.emit("engine-error", message); } } });
        } });
}
