// keyvault — desktop app. The window talks to the Node backend over a pipe:
// one JSON line per request, one per reply. No port, no network. Crypto stays in Node (libsodium).
// Request and reply contents are never logged.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

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
// src/backend.js in the source tree (development builds)
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
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../src/backend.js")
}

fn spawn(app: &AppHandle) -> Result<Backend, String> {
    let script = backend_script(app);
    if !script.exists() {
        return Err(format!("לא נמצא {}", script.display()));
    }
    let mut cmd = Command::new("node");
    cmd.arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("לא הצלחתי להפעיל node: {e}"))?;
    let stdin = child.stdin.take().ok_or("אין stdin")?;
    let stdout = BufReader::new(child.stdout.take().ok_or("אין stdout")?);
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
    let resp: Value = serde_json::from_str(&out).map_err(|_| "תשובה לא תקינה מהשרת".to_string())?;
    if resp.get("id").and_then(Value::as_u64) != Some(id) {
        return Err("תשובה לא תואמת".into());
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

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![kv])
        .run(tauri::generate_context!())
        .expect("keyvault: הפעלת החלון נכשלה");
}
