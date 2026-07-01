// src-tauri/src/commands/server.rs
//
// 局域网分享 HTTP 服务器 — 轻量版
//
// 接收一个完整的自包含 HTML 字符串（由 saveDashboard 生成），
// 启动 HTTP 服务器监听 0.0.0.0:port，任何请求都返回该 HTML。
// 适用于分享离线 Dashboard 文件给局域网内其他设备。

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::RwLock;
use std::thread;
use std::time::Duration;
use tiny_http::{Header, Response, Server};

// ─────────────────────────────────────────────────────────────────────────────
// Global state
// ─────────────────────────────────────────────────────────────────────────────

/// Whether the server is currently running.
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

/// The thread handle of the running server.
static SERVER_HANDLE: Lazy<RwLock<Option<thread::JoinHandle<()>>>> =
    Lazy::new(|| RwLock::new(None));

/// The port the server is listening on.
static SERVER_PORT: Lazy<RwLock<u16>> = Lazy::new(|| RwLock::new(0));

/// The cached HTML content to serve.
static CACHED_HTML: Lazy<RwLock<Option<String>>> = Lazy::new(|| RwLock::new(None));

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub url: String,
    pub port: u16,
    pub ip: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub url: Option<String>,
    pub port: Option<u16>,
    pub ip: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Server main loop
// ─────────────────────────────────────────────────────────────────────────────

fn run_server(server: Server) {
    SERVER_RUNNING.store(true, Ordering::SeqCst);
    let timeout = Duration::from_millis(500);

    while SERVER_RUNNING.load(Ordering::SeqCst) {
        match server.recv_timeout(timeout) {
            Ok(Some(request)) => {
                // Every request → return the cached HTML
                let html = CACHED_HTML.read().unwrap();
                let body = html.as_deref().unwrap_or(
                    "<!DOCTYPE html><html><body><h1>No content</h1></body></html>",
                );
                let response = Response::from_string(body).with_header(
                    Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                        .unwrap(),
                );
                let _ = request.respond(response);
            }
            Ok(None) => {} // timeout, check running flag
            Err(e) => {
                eprintln!("[share-server] recv error: {e}");
                break;
            }
        }
    }
    SERVER_RUNNING.store(false, Ordering::SeqCst);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands
// ─────────────────────────────────────────────────────────────────────────────

/// Start the LAN sharing HTTP server.
///
/// # Parameters
/// - `port`: TCP port to listen on
/// - `html`: The self-contained HTML string to serve
#[tauri::command]
pub fn start_server(port: u16, html: String) -> Result<ServerInfo, String> {
    // Check if already running
    if SERVER_RUNNING.load(Ordering::SeqCst) {
        return Err("服务器已在运行中".into());
    }

    // Store HTML
    *CACHED_HTML.write().unwrap() = Some(html);

    // Bind to 0.0.0.0
    let addr = format!("0.0.0.0:{port}");
    let server =
        Server::http(&addr).map_err(|e| format!("无法绑定端口 {port}: {e}"))?;

    // Get local IP address
    let ip = local_ip_address::local_ip()
        .map(|i| i.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let url = format!("http://{ip}:{port}");

    // Store port
    *SERVER_PORT.write().unwrap() = port;

    // Start server in background thread
    let handle = thread::Builder::new()
        .name("share-server".into())
        .spawn(move || {
            run_server(server);
        })
        .map_err(|e| format!("无法启动服务器线程: {e}"))?;

    *SERVER_HANDLE.write().unwrap() = Some(handle);
    SERVER_RUNNING.store(true, Ordering::SeqCst);

    Ok(ServerInfo { url, port, ip })
}

/// Stop the LAN sharing HTTP server.
#[tauri::command]
pub fn stop_server() -> Result<(), String> {
    if !SERVER_RUNNING.load(Ordering::SeqCst) {
        return Err("服务器未在运行".into());
    }

    SERVER_RUNNING.store(false, Ordering::SeqCst);

    let handle = SERVER_HANDLE.write().unwrap().take();
    if let Some(h) = handle {
        let _ = h.join();
    }

    *SERVER_PORT.write().unwrap() = 0;
    Ok(())
}

/// Get the current server status.
#[tauri::command]
pub fn get_server_status() -> ServerStatus {
    let running = SERVER_RUNNING.load(Ordering::SeqCst);
    let port = *SERVER_PORT.read().unwrap();

    if running && port > 0 {
        let ip = local_ip_address::local_ip()
            .map(|i| i.to_string())
            .unwrap_or_else(|_| "127.0.0.1".to_string());
        let url = format!("http://{ip}:{port}");
        ServerStatus {
            running: true,
            url: Some(url),
            port: Some(port),
            ip: Some(ip),
        }
    } else {
        ServerStatus {
            running: false,
            url: None,
            port: None,
            ip: None,
        }
    }
}

/// Update the cached HTML (called when dashboard data changes).
#[tauri::command]
pub fn update_server_html(html: String) -> Result<(), String> {
    *CACHED_HTML.write().unwrap() = Some(html);
    Ok(())
}
