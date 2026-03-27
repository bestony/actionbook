use std::io::{BufRead, BufReader};
use std::process::{Child, Stdio};
use std::time::Duration;

use crate::error::CliError;

/// Find Chrome executable on macOS/Linux.
pub fn find_chrome() -> Result<String, CliError> {
    let candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
    ];
    for c in &candidates {
        if std::path::Path::new(c).exists() {
            return Ok(c.to_string());
        }
        if let Ok(output) = std::process::Command::new("which")
            .arg(c)
            .output()
        {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(path);
                }
            }
        }
    }
    Err(CliError::BrowserNotFound)
}

/// Launch Chrome with CDP enabled.
/// Returns (Child, actual_cdp_port).
/// Uses --remote-debugging-port=0 so Chrome picks a free port itself,
/// then reads the actual port from stderr ("DevTools listening on ws://...").
pub fn launch_chrome(
    executable: &str,
    headless: bool,
    user_data_dir: &str,
    open_url: Option<&str>,
) -> Result<(Child, u16), CliError> {
    let mut args = vec![
        "--remote-debugging-port=0".to_string(),
        format!("--user-data-dir={user_data_dir}"),
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
    ];
    if headless {
        args.push("--headless=new".to_string());
    }
    if let Some(url) = open_url {
        args.push(ensure_scheme(url));
    }

    let mut child = std::process::Command::new(executable)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| CliError::BrowserLaunchFailed(e.to_string()))?;

    // Read stderr to find the actual CDP port.
    // Chrome prints: "DevTools listening on ws://127.0.0.1:PORT/devtools/browser/UUID"
    let stderr = child.stderr.take().ok_or_else(|| {
        CliError::BrowserLaunchFailed("failed to capture Chrome stderr".to_string())
    })?;

    let port = std::thread::spawn(move || -> Option<u16> {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            // Look for: "DevTools listening on ws://127.0.0.1:PORT/..."
            if line.contains("DevTools listening on ws://") {
                // Extract port from the URL
                if let Some(start) = line.find("127.0.0.1:") {
                    let after = &line[start + "127.0.0.1:".len()..];
                    if let Some(end) = after.find('/') {
                        if let Ok(p) = after[..end].parse::<u16>() {
                            return Some(p);
                        }
                    }
                }
            }
        }
        None
    });

    let port = port
        .join()
        .ok()
        .flatten()
        .ok_or_else(|| {
            let _ = child.kill();
            CliError::CdpConnectionFailed(
                "Chrome did not print DevTools listening URL".to_string(),
            )
        })?;

    Ok((child, port))
}

/// Discover the WebSocket debugger URL from Chrome's /json/version endpoint.
pub async fn discover_ws_url(port: u16) -> Result<String, CliError> {
    let url = format!("http://127.0.0.1:{port}/json/version");

    // Up to 15 seconds (75 × 200ms)
    for attempt in 0..75 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        match reqwest::get(&url).await {
            Ok(resp) => {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(ws) = json
                        .get("webSocketDebuggerUrl")
                        .and_then(|v| v.as_str())
                    {
                        return Ok(ws.to_string());
                    }
                }
            }
            Err(_) => continue,
        }
    }
    Err(CliError::CdpConnectionFailed(format!(
        "Chrome did not expose CDP on port {port} within 15s"
    )))
}

/// Get list of targets (tabs) from Chrome.
pub async fn list_targets(port: u16) -> Result<Vec<serde_json::Value>, CliError> {
    let url = format!("http://127.0.0.1:{port}/json/list");
    let resp = reqwest::get(&url)
        .await
        .map_err(|e| CliError::CdpConnectionFailed(e.to_string()))?;
    let targets: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| CliError::CdpConnectionFailed(e.to_string()))?;
    Ok(targets
        .into_iter()
        .filter(|t| t.get("type").and_then(|v| v.as_str()) == Some("page"))
        .collect())
}

fn ensure_scheme(url: &str) -> String {
    if url.contains("://") {
        url.to_string()
    } else if url.starts_with("about:") || url.starts_with("data:") || url.starts_with("chrome:") || url.starts_with("javascript:") {
        url.to_string()
    } else {
        format!("https://{url}")
    }
}
