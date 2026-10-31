#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{io::{Read, Write}, net::{SocketAddr, TcpStream}, path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex, time::Duration};
use tauri::{Manager, RunEvent};

struct OllamaBridge(Mutex<Option<Child>>);

enum BridgeState { Offline, Ready, Occupied }

fn local_bridge_state() -> BridgeState {
    let address = SocketAddr::from(([127, 0, 0, 1], 8787));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(350)) else {
        return BridgeState::Offline;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
    if stream.write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").is_err() {
        return BridgeState::Occupied;
    }
    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() { return BridgeState::Occupied; }
    if response.starts_with("HTTP/1.1 200") && response.contains("\"provider\":\"ollama\"") {
        BridgeState::Ready
    } else {
        BridgeState::Occupied
    }
}

fn bridge_script(app: &tauri::App) -> Result<PathBuf, Box<dyn std::error::Error>> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../bridge/ollama.mjs"));
    }
    Ok(app.path().resource_dir()?.join("bridge/ollama.mjs"))
}

fn stop_bridge(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<OllamaBridge>() {
        if let Ok(mut child) = state.0.lock() {
            if let Some(mut process) = child.take() {
                let _ = process.kill();
                let _ = process.wait();
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let child = match local_bridge_state() {
                BridgeState::Ready => None,
                BridgeState::Occupied => return Err(std::io::Error::new(std::io::ErrorKind::AddrInUse, "Port 8787 is in use by a non-Ollama service. Stop it before launching J.A.R.V.I.S.").into()),
                BridgeState::Offline => {
                    let script = bridge_script(app)?;
                    let working_dir = script.parent().unwrap_or_else(|| std::path::Path::new("."));
                    Some(Command::new("node")
                        .arg(&script)
                        .current_dir(working_dir)
                        .env("JARVIS_BRIDGE_PORT", "8787")
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()?)
                }
            };
            app.manage(OllamaBridge(Mutex::new(child)));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build J.A.R.V.I.S. desktop")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                stop_bridge(app);
            }
        });
}
