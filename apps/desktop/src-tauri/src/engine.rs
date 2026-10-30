use std::{path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex, time::Duration};
use serde::Serialize;
use tauri::Manager;

pub const BASE_URL: &str = "http://127.0.0.1:4782";
#[derive(Default)]
pub struct Engine(pub Mutex<Option<Child>>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection { base_url: String, token: String, owned: bool }

fn token_dir() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("TRAFFICBOT_CONTROL_DIR") { return Ok(PathBuf::from(path)); }
    Ok(dirs::home_dir().ok_or("Cannot resolve home directory")?.join(".trafficbot"))
}
fn token() -> Result<String, String> {
    let token = std::fs::read_to_string(token_dir()?.join("control-token")).map_err(|_| "Controller token is unavailable")?;
    let token = token.trim();
    if token.len() != 64 || !token.bytes().all(|c| c.is_ascii_hexdigit()) { return Err("Invalid controller token".into()); }
    Ok(token.into())
}
fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder().no_proxy().timeout(Duration::from_secs(4)).build().map_err(|_| "Cannot create local connection".into())
}
fn probe() -> Result<bool, String> {
    let response = client()?.get(format!("{BASE_URL}/api/system")).bearer_auth(token().unwrap_or_default()).send();
    match response {
        Err(e) if e.is_connect() => Ok(false),
        Err(_) => Err("Controller did not respond. Check port 4782.".into()),
        Ok(r) if !r.status().is_success() => Err("A service on port 4782 rejected authentication. Check the installation token.".into()),
        Ok(r) => {
            let value: serde_json::Value = r.json().map_err(|_| "Invalid controller response")?;
            if value["application"] != "trafficbot" || value["apiVersion"] != 1 { return Err("Incompatible service on port 4782".into()); }
            Ok(true)
        }
    }
}
pub fn connect(app: &tauri::AppHandle) -> Result<Connection, String> {
    let state = app.state::<Engine>();
    let mut child = state.0.lock().map_err(|_| "Engine state unavailable")?;
    if let Some(process) = child.as_mut() { if process.try_wait().map_err(|_| "Cannot inspect engine")?.is_some() { *child = None; } }
    if !probe()? {
        if child.is_some() { return Err("Controller is starting or unavailable; retry shortly".into()); }
        let (binary, root) = if cfg!(debug_assertions) {
            let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
            let bin = if cfg!(windows) { "node.exe" } else { "node" };
            (PathBuf::from(bin), root)
        } else {
            let root = app.path().resource_dir().map_err(|_| "Cannot locate engine resources")?.join("engine");
            let bin = if cfg!(windows) { "trafficbot-sidecar.exe" } else { "trafficbot-sidecar" };
            (root.join(bin), root)
        };
        
        std::fs::create_dir_all(token_dir()?).map_err(|_| "Cannot create controller directory")?;
        let log = std::fs::OpenOptions::new().create(true).append(true).open(token_dir()?.join("controller.log")).map_err(|_| "Cannot open controller log")?;
        let stderr = log.try_clone().map_err(|_| "Cannot open controller log")?;
        
        let mut command = Command::new(&binary);
        if cfg!(debug_assertions) {
            command.arg(root.join("dist/controller.js"));
        }
        
        command.current_dir(token_dir()?).env("CONTROL_PORT", "4782").env("TRAFFICBOT_CONTROL_DIR", token_dir()?).stdin(Stdio::null()).stdout(log).stderr(stderr);
        #[cfg(windows)] { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
        
        *child = Some(command.spawn().map_err(|e| format!("Could not launch sidecar at {}: {}", binary.display(), e))?);
        
        for _ in 0..50 {
            if child.as_mut().unwrap().try_wait().map_err(|_| "Cannot inspect controller")?.is_some() { *child = None; return Err("Controller exited during startup. Inspect ~/.trafficbot/controller.log".into()); }
            if probe()? { break; }
            std::thread::sleep(Duration::from_millis(100));
        }
        if !probe()? { return Err("Controller startup timed out. Retry or inspect the controller log.".into()); }
    }
    Ok(Connection { base_url: BASE_URL.into(), token: token()?, owned: child.is_some() })
}
pub fn stop(app: &tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<Engine>();
    let mut child = state.0.lock().map_err(|_| "Engine state unavailable")?;
    let Some(process) = child.as_mut() else { return Ok(()); };
    if process.try_wait().map_err(|_| "Cannot inspect controller")?.is_some() { *child = None; return Ok(()); }
    let response = client()?.post(format!("{BASE_URL}/api/engine/shutdown")).bearer_auth(token()?).send().map_err(|_| "Controller cannot confirm safe shutdown; it has been left running")?;
    if response.status().as_u16() != 202 { return Err("Shutdown refused: pending sessions or unavailable Redis. Controller left running.".into()); }
    for _ in 0..100 { if process.try_wait().map_err(|_| "Cannot inspect controller")?.is_some() { *child = None; return Ok(()); } std::thread::sleep(Duration::from_millis(100)); }
    Err("Controller has not exited yet; no process was force-killed".into())
}

pub fn pause_campaigns() -> Result<(), String> {
    let response = client()?.post(format!("{BASE_URL}/api/campaigns/pause-all")).bearer_auth(token()?).send().map_err(|_| "Controller unavailable")?;
    if response.status().is_success() { Ok(()) } else { Err("Could not pause campaigns".into()) }
}

pub fn minimize_to_tray() -> bool {
    token_dir().ok().and_then(|dir| std::fs::read_to_string(dir.join("desktop.json")).ok()).and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok()).and_then(|value| value["minimizeToTray"].as_bool()).unwrap_or(true)
}
pub fn set_minimize_to_tray(enabled: bool) -> Result<(), String> {
    let dir = token_dir()?;
    std::fs::create_dir_all(&dir).map_err(|_| "Cannot create preferences directory")?;
    std::fs::write(dir.join("desktop.json"), serde_json::json!({ "minimizeToTray": enabled }).to_string()).map_err(|_| "Cannot save desktop preference".into())
}
