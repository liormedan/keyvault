// kv-vault — desktop app. The window talks to the Node backend over a pipe:
// one JSON line per request, one per reply. No port, no network. Crypto stays in Node (libsodium).
// Request and reply contents are never logged.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

struct Backend {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next: u64,
}

impl Drop for Backend {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

#[derive(Default)]
struct AppState(Mutex<Option<Backend>>);

// Order: KV_BACKEND (override) → the bundled backend.mjs shipped with the installer →
// the bundle in the source tree (`npm run build`, development builds)
fn backend_script(app: &AppHandle) -> PathBuf {
    if let Ok(p) = std::env::var("KV_BACKEND") {
        return PathBuf::from(p);
    }
    if let Ok(dir) = app.path().resource_dir() {
        let bundled = dir.join("backend.mjs");
        if bundled.exists() {
            return bundled;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/backend.mjs")
}

// KV_BACKEND_LOG: the window test collects the backend's stderr (startup errors only — it never writes values)
fn backend_stderr() -> Stdio {
    std::env::var("KV_BACKEND_LOG")
        .ok()
        .and_then(|p| std::fs::OpenOptions::new().create(true).append(true).open(p).ok())
        .map_or_else(Stdio::null, Stdio::from)
}

fn spawn(app: &AppHandle) -> Result<Backend, String> {
    let script = backend_script(app);
    if !script.exists() {
        return Err(format!("backend not found: {}", script.display()));
    }
    let mut cmd = Command::new("node");
    cmd.arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(backend_stderr());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("could not start node (is Node.js 20+ installed?): {e}"))?;
    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = BufReader::new(child.stdout.take().ok_or("no stdout")?);
    Ok(Backend { child, stdin, stdout, next: 0 })
}

fn call(backend: &mut Backend, method: &str, params: Value) -> Result<Value, String> {
    backend.next += 1;
    let id = backend.next;
    let line = json!({ "id": id, "method": method, "params": params }).to_string();
    writeln!(backend.stdin, "{line}")
        .and_then(|_| backend.stdin.flush())
        .map_err(|_| "backend-gone".to_string())?;
    let mut out = String::new();
    match backend.stdout.read_line(&mut out) {
        Ok(0) | Err(_) => return Err("backend-gone".into()),
        Ok(_) => {}
    }
    let resp: Value = serde_json::from_str(&out).map_err(|_| "invalid reply from the backend".to_string())?;
    if resp.get("id").and_then(Value::as_u64) != Some(id) {
        return Err("mismatched reply from the backend".into());
    }
    if let Some(e) = resp.get("error").and_then(Value::as_str) {
        return Err(e.to_string());
    }
    Ok(resp.get("result").cloned().unwrap_or(Value::Null))
}

// async: runs off the window thread, so Argon2 (~1s) doesn't freeze the UI
#[tauri::command]
async fn kv(app: AppHandle, state: State<'_, AppState>, method: String, params: Option<Value>) -> Result<Value, String> {
    let mut guard = state.0.lock().map_err(|_| "busy".to_string())?;
    if guard.is_none() {
        *guard = Some(spawn(&app)?);
    }
    let result = call(guard.as_mut().unwrap(), &method, params.unwrap_or_else(|| json!({})));
    if matches!(&result, Err(e) if e == "backend-gone") {
        *guard = None; // The backend died — its unlocked state died with it; it restarts locked on the next call
        return Err("locked".into());
    }
    result
}

// ── Lock with the workstation ──
// While Windows is locked (Win+L, sign-out, wake from sleep to the lock screen) the interactive input
// desktop belongs to Winlogon, so OpenInputDesktop fails. Polling that is simpler and more robust than
// session notifications, which need a message window. A UAC prompt also counts — locking then is fine.
#[cfg(windows)]
fn workstation_locked() -> bool {
    use windows_sys::Win32::System::StationsAndDesktops::{CloseDesktop, OpenInputDesktop, DESKTOP_SWITCHDESKTOP};
    unsafe {
        let desk = OpenInputDesktop(0, 0, DESKTOP_SWITCHDESKTOP);
        if desk.is_null() {
            return true;
        }
        CloseDesktop(desk);
        false
    }
}

#[cfg(not(windows))]
fn workstation_locked() -> bool {
    false
}

fn lock_vault(app: &AppHandle) {
    let state = app.state::<AppState>();
    if let Ok(mut guard) = state.0.lock() {
        if let Some(backend) = guard.as_mut() {
            let _ = call(backend, "lock", json!({}));
        }
    }
    let _ = app.emit("kv-locked", ());
}

fn watch_session(app: AppHandle) {
    // KV_SIMULATE_LOCK_AFTER_MS: tests trigger the same path once, without locking the real screen
    let simulate_at = std::env::var("KV_SIMULATE_LOCK_AFTER_MS")
        .ok()
        .and_then(|ms| ms.parse::<u64>().ok())
        .map(|ms| Instant::now() + Duration::from_millis(ms));
    std::thread::spawn(move || {
        let mut was_locked = false;
        let mut simulated = false;
        loop {
            std::thread::sleep(Duration::from_millis(500));
            let locked = workstation_locked();
            let simulate = !simulated && simulate_at.is_some_and(|at| Instant::now() >= at);
            if (locked && !was_locked) || simulate {
                simulated |= simulate;
                lock_vault(&app);
            }
            was_locked = locked;
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            watch_session(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![kv])
        .run(tauri::generate_context!())
        .expect("kv-vault: failed to start the window");
}
