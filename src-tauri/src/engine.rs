use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::result::{to_unix_file_url, CommandResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppDirs {
    pub recovery_dir: String,
    pub working_dir: String,
    pub lo_bundle_root: String,
    pub profiles_dir: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub running: bool,
    pub pid: Option<u64>,
    pub port: Option<u16>,
    pub profile_dir: Option<String>,
    pub lo_version: Option<String>,
    pub last_network_request: String,
    pub engine_available: bool,
    pub degraded: bool,
    pub degraded_reason: Option<String>,
}

pub struct EngineState {
    pub child: Mutex<Option<u64>>,
    pub degraded: AtomicBool,
    pub degraded_reason: Mutex<Option<String>>,
}

impl Default for EngineState {
    fn default() -> Self {
        EngineState {
            child: Mutex::new(None),
            degraded: AtomicBool::new(false),
            degraded_reason: Mutex::new(None),
        }
    }
}

/// Locate the bundled LibreOffice `soffice` executable relative to app resources.
pub fn soffice_binary(app: &AppHandle) -> Option<PathBuf> {
    let resource = app.path().resource_dir().ok()?;
    // The array-glob resources form keeps the `resources/libreoffice/runtime` prefix in
    // the bundle; the map form flattens it to `libreoffice`. Probe both layouts.
    let roots = [
        resource.join("libreoffice"),
        resource.join("libreoffice/runtime"),
        resource.join("resources/libreoffice/runtime"),
    ];
    let candidates: Vec<PathBuf> = if cfg!(target_os = "macos") {
        let mut v = vec![
            resource.join("libreoffice/LibreOffice.app/Contents/MacOS/soffice"),
            resource.join("libreoffice/LibreOffice.app/Contents/MacOS/soffice.bin"),
            resource.join("libreoffice/program/soffice"),
        ];
        for root in &roots {
            v.push(root.join("LibreOffice.app/Contents/MacOS/soffice"));
            v.push(root.join("LibreOffice.app/Contents/MacOS/soffice.bin"));
            v.push(root.join("program/soffice"));
        }
        v
    } else if cfg!(target_os = "windows") {
        let mut v = vec![
            resource.join("libreoffice/program/soffice.exe"),
            resource.join("libreoffice/program/soffice.com"),
        ];
        for root in &roots {
            v.push(root.join("program/soffice.exe"));
            v.push(root.join("program/soffice.com"));
        }
        v
    } else {
        let mut v = vec![
            resource.join("libreoffice/program/soffice"),
            resource.join("libreoffice/usr/lib/libreoffice/program/soffice"),
        ];
        for root in &roots {
            v.push(root.join("program/soffice"));
            v.push(root.join("usr/lib/libreoffice/program/soffice"));
        }
        v
    };
    candidates.into_iter().find(|p| p.exists()).or_else(|| {
        // Dev convenience: allow an override so local runs work without bundling LO.
        std::env::var("LUMEN_SUITE_SOFFICE").ok().map(PathBuf::from)
    })
}

pub fn engine_available(app: &AppHandle) -> bool {
    soffice_binary(app).is_some()
}

pub fn lo_version(app: &AppHandle) -> Option<String> {
    let bin = soffice_binary(app)?;
    let out = std::process::Command::new(&bin)
        .arg("--version")
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Create (or reuse) the isolated UserInstallation profile directory.
pub fn ensure_profile_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let profile = base.join("profiles").join("main");
    std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
    Ok(profile)
}

fn current_status(app: &AppHandle, state: &EngineState) -> EngineStatus {
    let available = engine_available(app);
    let pid = *state.child.lock().unwrap();
    let degraded = state.degraded.load(Ordering::SeqCst);
    let reason = state.degraded_reason.lock().unwrap().clone();
    let profile_dir = available
        .then(|| {
            ensure_profile_dir(app)
                .ok()
                .map(|d| d.to_string_lossy().to_string())
        })
        .flatten();
    EngineStatus {
        running: pid.is_some(),
        pid,
        port: None,
        profile_dir,
        lo_version: if available { lo_version(app) } else { None },
        last_network_request: "none".to_string(),
        engine_available: available,
        degraded,
        degraded_reason: reason,
    }
}

#[tauri::command]
pub fn engine_status(
    app: AppHandle,
    state: tauri::State<'_, EngineState>,
) -> CommandResult<EngineStatus> {
    CommandResult::ok(current_status(&app, &state))
}

#[tauri::command]
pub fn engine_start(
    app: AppHandle,
    state: tauri::State<'_, EngineState>,
) -> CommandResult<EngineStatus> {
    if !engine_available(&app) {
        return CommandResult::err(
            "LibreOffice engine is not bundled with this build — install a packaged release",
        );
    }
    let mut child = state.child.lock().unwrap();
    if child.is_some() {
        return CommandResult::ok(current_status(&app, &state));
    }
    let profile = match ensure_profile_dir(&app) {
        Ok(p) => p,
        Err(e) => {
            state.degraded.store(true, Ordering::SeqCst);
            *state.degraded_reason.lock().unwrap() = Some(format!("profile setup failed: {}", e));
            return CommandResult::ok(current_status(&app, &state));
        }
    };
    let bin = match soffice_binary(&app) {
        Some(b) => b,
        None => {
            state.degraded.store(true, Ordering::SeqCst);
            *state.degraded_reason.lock().unwrap() =
                Some("soffice binary missing after availability check".into());
            return CommandResult::ok(current_status(&app, &state));
        }
    };
    let profile_url = to_unix_file_url(&profile);
    let mut cmd = std::process::Command::new(&bin);
    cmd.args([
        "--headless",
        "--invisible",
        "--nologo",
        "--nodefault",
        "--norestore",
        "--nolockcheck",
        &format!("-env:UserInstallation={}", profile_url),
    ]);
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    match cmd.spawn() {
        Ok(mut p) => {
            let pid_hash = p.id();
            std::thread::spawn(move || {
                let _ = p.wait();
            });
            *child = Some(pid_hash as u64);
            state.degraded.store(false, Ordering::SeqCst);
            *state.degraded_reason.lock().unwrap() = None;
        }
        Err(e) => {
            state.degraded.store(true, Ordering::SeqCst);
            *state.degraded_reason.lock().unwrap() = Some(format!("engine spawn failed: {}", e));
        }
    }
    CommandResult::ok(current_status(&app, &state))
}

#[tauri::command]
pub fn engine_shutdown(
    app: AppHandle,
    state: tauri::State<'_, EngineState>,
) -> CommandResult<EngineStatus> {
    let pid = state.child.lock().unwrap().take();
    if let Some(pid) = pid {
        kill_tree(pid);
    }
    state.degraded.store(false, Ordering::SeqCst);
    *state.degraded_reason.lock().unwrap() = None;
    CommandResult::ok(EngineStatus {
        running: false,
        pid: None,
        port: None,
        profile_dir: None,
        lo_version: lo_version(&app),
        last_network_request: "none".to_string(),
        engine_available: engine_available(&app),
        degraded: false,
        degraded_reason: None,
    })
}

#[cfg(target_os = "windows")]
fn kill_tree(pid: u64) {
    let _ = std::process::Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}

#[cfg(unix)]
fn kill_tree(pid: u64) {
    // SIGTERM the process group best-effort.
    let _ = unsafe { killraw(pid as i32, 15) };
}

#[cfg(unix)]
unsafe fn killraw(pid: i32, sig: i32) -> i32 {
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    kill(pid, sig)
}

/// Resolve the app-scoped data directories, creating them as needed.
pub fn state_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let recovery_dir = base.join("recovery");
    let working_dir = base.join("working");
    std::fs::create_dir_all(&recovery_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&working_dir).map_err(|e| e.to_string())?;
    let bundles_root = app.path().resource_dir().unwrap_or(base.join("bundle"));
    Ok((recovery_dir, working_dir, bundles_root))
}
