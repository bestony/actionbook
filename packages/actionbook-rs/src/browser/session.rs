use std::fs;
use std::path::PathBuf;

use chromiumoxide::browser::Browser;
use chromiumoxide::handler::Handler;
use futures::StreamExt;
use serde::{Deserialize, Serialize};

use super::launcher::BrowserLauncher;
use crate::config::{Config, ProfileConfig};
use crate::error::{ActionbookError, Result};

/// Page info from CDP /json/list endpoint
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub id: String,
    pub title: String,
    pub url: String,
    #[serde(rename = "type")]
    pub page_type: String,
    pub web_socket_debugger_url: Option<String>,
}

/// Session state persisted to disk
#[derive(Debug, Serialize, Deserialize)]
struct SessionState {
    profile_name: String,
    cdp_port: u16,
    pid: Option<u32>,
    cdp_url: String,
}

/// Manages browser sessions across CLI invocations
pub struct SessionManager {
    config: Config,
    sessions_dir: PathBuf,
}

impl SessionManager {
    pub fn new(config: Config) -> Self {
        let sessions_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("actionbook")
            .join("sessions");

        Self {
            config,
            sessions_dir,
        }
    }

    /// Get the session state file path for a profile
    fn session_file(&self, profile_name: &str) -> PathBuf {
        self.sessions_dir.join(format!("{}.json", profile_name))
    }

    /// Load session state from disk
    fn load_session_state(&self, profile_name: &str) -> Option<SessionState> {
        let path = self.session_file(profile_name);
        if path.exists() {
            let content = fs::read_to_string(&path).ok()?;
            serde_json::from_str(&content).ok()
        } else {
            None
        }
    }

    /// Save session state to disk
    fn save_session_state(&self, state: &SessionState) -> Result<()> {
        fs::create_dir_all(&self.sessions_dir)?;
        let path = self.session_file(&state.profile_name);
        let content = serde_json::to_string_pretty(state)?;
        fs::write(path, content)?;
        Ok(())
    }

    /// Remove session state from disk
    fn remove_session_state(&self, profile_name: &str) -> Result<()> {
        let path = self.session_file(profile_name);
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    /// Check if a session is still alive
    async fn is_session_alive(&self, state: &SessionState) -> bool {
        // Check if we can connect to the CDP port (bypass proxy for localhost)
        let url = format!("http://127.0.0.1:{}/json/version", state.cdp_port);
        let client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        client.get(&url).send().await.is_ok()
    }

    /// Get or create a browser session for the given profile
    pub async fn get_or_create_session(
        &self,
        profile_name: Option<&str>,
    ) -> Result<(Browser, Handler)> {
        let profile_name = profile_name.unwrap_or("default");
        let profile = self.config.get_profile(profile_name)?;

        // Check for existing session
        if let Some(state) = self.load_session_state(profile_name) {
            if self.is_session_alive(&state).await {
                tracing::debug!("Reusing existing session for profile: {}", profile_name);
                return self.connect_to_session(&state).await;
            } else {
                tracing::debug!("Session for profile {} is dead, removing", profile_name);
                self.remove_session_state(profile_name)?;
            }
        }

        // Create new session
        tracing::debug!("Creating new session for profile: {}", profile_name);
        self.create_session(profile_name, &profile).await
    }

    /// Create a new browser session
    async fn create_session(
        &self,
        profile_name: &str,
        profile: &ProfileConfig,
    ) -> Result<(Browser, Handler)> {
        let launcher = BrowserLauncher::from_profile(profile)?;
        let (_child, cdp_url) = launcher.launch_and_wait().await?;

        // Save session state
        let state = SessionState {
            profile_name: profile_name.to_string(),
            cdp_port: launcher.get_cdp_port(),
            pid: None, // TODO: get actual PID
            cdp_url: cdp_url.clone(),
        };
        self.save_session_state(&state)?;

        // Connect to the browser
        self.connect_to_session(&state).await
    }

    /// Connect to an existing browser session
    async fn connect_to_session(&self, state: &SessionState) -> Result<(Browser, Handler)> {
        let (browser, handler) = Browser::connect(&state.cdp_url).await.map_err(|e| {
            ActionbookError::CdpConnectionFailed(format!("Failed to connect to browser: {}", e))
        })?;

        Ok((browser, handler))
    }

    /// Close a browser session
    pub async fn close_session(&self, profile_name: Option<&str>) -> Result<()> {
        let profile_name = profile_name.unwrap_or("default");

        if let Some(state) = self.load_session_state(profile_name) {
            // Try to close the browser gracefully
            if let Ok((mut browser, mut handler)) = self.connect_to_session(&state).await {
                // Spawn handler to process events
                tokio::spawn(async move {
                    while handler.next().await.is_some() {}
                });

                // Close browser
                let _ = browser.close().await;
            }

            // Remove session state
            self.remove_session_state(profile_name)?;
        }

        Ok(())
    }

    /// Get list of pages from the browser
    pub async fn get_pages(&self, profile_name: Option<&str>) -> Result<Vec<PageInfo>> {
        let profile_name = profile_name.unwrap_or("default");
        let state = self
            .load_session_state(profile_name)
            .ok_or(ActionbookError::BrowserNotRunning)?;

        let url = format!("http://127.0.0.1:{}/json/list", state.cdp_port);
        let client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let response = client.get(&url).send().await.map_err(|e| {
            ActionbookError::CdpConnectionFailed(format!("Failed to get pages: {}", e))
        })?;

        let pages: Vec<PageInfo> = response.json().await.map_err(|e| {
            ActionbookError::CdpConnectionFailed(format!("Failed to parse pages: {}", e))
        })?;

        // Filter to only include actual pages (not extensions, service workers, etc.)
        Ok(pages
            .into_iter()
            .filter(|p| p.page_type == "page")
            .collect())
    }

    /// Get the active page info (first page in the list)
    pub async fn get_active_page_info(&self, profile_name: Option<&str>) -> Result<PageInfo> {
        let pages = self.get_pages(profile_name).await?;
        pages.into_iter().next().ok_or(ActionbookError::BrowserNotRunning)
    }

    /// Execute JavaScript on the active page using direct CDP via WebSocket
    pub async fn eval_on_page(&self, profile_name: Option<&str>, expression: &str) -> Result<serde_json::Value> {
        use futures::SinkExt;
        use tokio_tungstenite::connect_async;

        let page_info = self.get_active_page_info(profile_name).await?;
        let ws_url = page_info
            .web_socket_debugger_url
            .ok_or_else(|| ActionbookError::CdpConnectionFailed("No WebSocket URL".to_string()))?;

        // Connect to page WebSocket
        let (mut ws, _) = connect_async(&ws_url).await.map_err(|e| {
            ActionbookError::CdpConnectionFailed(format!("WebSocket connection failed: {}", e))
        })?;

        // Send Runtime.evaluate command
        let cmd = serde_json::json!({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": expression,
                "returnByValue": true
            }
        });

        ws.send(tokio_tungstenite::tungstenite::Message::Text(cmd.to_string().into()))
            .await
            .map_err(|e| ActionbookError::Other(format!("Failed to send command: {}", e)))?;

        // Read response
        use futures::stream::StreamExt;
        while let Some(msg) = ws.next().await {
            match msg {
                Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                    let response: serde_json::Value = serde_json::from_str(text.as_str())?;
                    if response.get("id") == Some(&serde_json::json!(1)) {
                        if let Some(result) = response.get("result").and_then(|r| r.get("result")) {
                            if let Some(value) = result.get("value") {
                                return Ok(value.clone());
                            }
                            // Return the whole result if no value
                            return Ok(result.clone());
                        }
                        if let Some(error) = response.get("error") {
                            return Err(ActionbookError::JavaScriptError(error.to_string()));
                        }
                        return Ok(serde_json::Value::Null);
                    }
                }
                Ok(_) => continue,
                Err(e) => return Err(ActionbookError::Other(format!("WebSocket error: {}", e))),
            }
        }

        Err(ActionbookError::Other("No response received".to_string()))
    }

    /// Helper to send a CDP command and get response
    async fn send_cdp_command(
        &self,
        profile_name: Option<&str>,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value> {
        use futures::SinkExt;
        use tokio_tungstenite::connect_async;

        let page_info = self.get_active_page_info(profile_name).await?;
        let ws_url = page_info
            .web_socket_debugger_url
            .ok_or_else(|| ActionbookError::CdpConnectionFailed("No WebSocket URL".to_string()))?;

        let (mut ws, _) = connect_async(&ws_url).await.map_err(|e| {
            ActionbookError::CdpConnectionFailed(format!("WebSocket connection failed: {}", e))
        })?;

        let cmd = serde_json::json!({
            "id": 1,
            "method": method,
            "params": params
        });

        ws.send(tokio_tungstenite::tungstenite::Message::Text(cmd.to_string().into()))
            .await
            .map_err(|e| ActionbookError::Other(format!("Failed to send command: {}", e)))?;

        use futures::stream::StreamExt;
        while let Some(msg) = ws.next().await {
            match msg {
                Ok(tokio_tungstenite::tungstenite::Message::Text(text)) => {
                    let response: serde_json::Value = serde_json::from_str(text.as_str())?;
                    if response.get("id") == Some(&serde_json::json!(1)) {
                        if let Some(error) = response.get("error") {
                            return Err(ActionbookError::Other(format!("CDP error: {}", error)));
                        }
                        return Ok(response.get("result").cloned().unwrap_or(serde_json::Value::Null));
                    }
                }
                Ok(_) => continue,
                Err(e) => return Err(ActionbookError::Other(format!("WebSocket error: {}", e))),
            }
        }

        Err(ActionbookError::Other("No response received".to_string()))
    }

    /// Click an element on the active page
    pub async fn click_on_page(&self, profile_name: Option<&str>, selector: &str) -> Result<()> {
        // First, find the element and get its center coordinates
        let js = format!(
            r#"
            (function() {{
                const el = document.querySelector({});
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return {{
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                }};
            }})()
            "#,
            serde_json::to_string(selector)?
        );

        let coords = self.eval_on_page(profile_name, &js).await?;

        if coords.is_null() {
            return Err(ActionbookError::ElementNotFound(selector.to_string()));
        }

        let x = coords.get("x").and_then(|v| v.as_f64()).ok_or_else(|| {
            ActionbookError::Other("Invalid coordinates".to_string())
        })?;
        let y = coords.get("y").and_then(|v| v.as_f64()).ok_or_else(|| {
            ActionbookError::Other("Invalid coordinates".to_string())
        })?;

        // Send mouse click events
        self.send_cdp_command(
            profile_name,
            "Input.dispatchMouseEvent",
            serde_json::json!({
                "type": "mousePressed",
                "x": x,
                "y": y,
                "button": "left",
                "clickCount": 1
            }),
        )
        .await?;

        self.send_cdp_command(
            profile_name,
            "Input.dispatchMouseEvent",
            serde_json::json!({
                "type": "mouseReleased",
                "x": x,
                "y": y,
                "button": "left",
                "clickCount": 1
            }),
        )
        .await?;

        Ok(())
    }

    /// Type text into an element on the active page
    pub async fn type_on_page(&self, profile_name: Option<&str>, selector: &str, text: &str) -> Result<()> {
        // Focus the element first
        let js = format!(
            r#"
            (function() {{
                const el = document.querySelector({});
                if (!el) return false;
                el.focus();
                return true;
            }})()
            "#,
            serde_json::to_string(selector)?
        );

        let focused = self.eval_on_page(profile_name, &js).await?;
        if !focused.as_bool().unwrap_or(false) {
            return Err(ActionbookError::ElementNotFound(selector.to_string()));
        }

        // Type each character
        for c in text.chars() {
            self.send_cdp_command(
                profile_name,
                "Input.dispatchKeyEvent",
                serde_json::json!({
                    "type": "keyDown",
                    "text": c.to_string()
                }),
            )
            .await?;

            self.send_cdp_command(
                profile_name,
                "Input.dispatchKeyEvent",
                serde_json::json!({
                    "type": "keyUp",
                    "text": c.to_string()
                }),
            )
            .await?;
        }

        Ok(())
    }

    /// Fill an input element (clear and type)
    pub async fn fill_on_page(&self, profile_name: Option<&str>, selector: &str, text: &str) -> Result<()> {
        // Clear and set value directly via JS, then dispatch input event
        let js = format!(
            r#"
            (function() {{
                const el = document.querySelector({});
                if (!el) return false;
                el.focus();
                el.value = {};
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return true;
            }})()
            "#,
            serde_json::to_string(selector)?,
            serde_json::to_string(text)?
        );

        let filled = self.eval_on_page(profile_name, &js).await?;
        if !filled.as_bool().unwrap_or(false) {
            return Err(ActionbookError::ElementNotFound(selector.to_string()));
        }

        Ok(())
    }

    /// Take a screenshot of the active page
    pub async fn screenshot_page(&self, profile_name: Option<&str>) -> Result<Vec<u8>> {
        let result = self
            .send_cdp_command(
                profile_name,
                "Page.captureScreenshot",
                serde_json::json!({
                    "format": "png"
                }),
            )
            .await?;

        let data = result
            .get("data")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ActionbookError::Other("No screenshot data".to_string()))?;

        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|e| ActionbookError::Other(format!("Failed to decode screenshot: {}", e)))
    }

    /// Export the active page as PDF
    pub async fn pdf_page(&self, profile_name: Option<&str>) -> Result<Vec<u8>> {
        let result = self
            .send_cdp_command(
                profile_name,
                "Page.printToPDF",
                serde_json::json!({}),
            )
            .await?;

        let data = result
            .get("data")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ActionbookError::Other("No PDF data".to_string()))?;

        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|e| ActionbookError::Other(format!("Failed to decode PDF: {}", e)))
    }

    /// Take a full-page screenshot
    pub async fn screenshot_full_page(&self, profile_name: Option<&str>) -> Result<Vec<u8>> {
        // Get page dimensions
        let metrics = self
            .send_cdp_command(profile_name, "Page.getLayoutMetrics", serde_json::json!({}))
            .await?;

        let content_size = metrics
            .get("contentSize")
            .ok_or_else(|| ActionbookError::Other("No content size".to_string()))?;

        let width = content_size.get("width").and_then(|v| v.as_f64()).unwrap_or(1920.0);
        let height = content_size.get("height").and_then(|v| v.as_f64()).unwrap_or(1080.0);

        let result = self
            .send_cdp_command(
                profile_name,
                "Page.captureScreenshot",
                serde_json::json!({
                    "format": "png",
                    "clip": {
                        "x": 0,
                        "y": 0,
                        "width": width,
                        "height": height,
                        "scale": 1
                    },
                    "captureBeyondViewport": true
                }),
            )
            .await?;

        let data = result
            .get("data")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ActionbookError::Other("No screenshot data".to_string()))?;

        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|e| ActionbookError::Other(format!("Failed to decode screenshot: {}", e)))
    }

    /// Navigate to URL on current page
    pub async fn goto(&self, profile_name: Option<&str>, url: &str) -> Result<()> {
        self.send_cdp_command(
            profile_name,
            "Page.navigate",
            serde_json::json!({ "url": url }),
        )
        .await?;
        Ok(())
    }

    /// Go back in history
    pub async fn go_back(&self, profile_name: Option<&str>) -> Result<()> {
        let history = self
            .send_cdp_command(profile_name, "Page.getNavigationHistory", serde_json::json!({}))
            .await?;

        let current_index = history.get("currentIndex").and_then(|v| v.as_i64()).unwrap_or(0);
        if current_index > 0 {
            let entries = history.get("entries").and_then(|v| v.as_array());
            if let Some(entries) = entries {
                if let Some(entry) = entries.get((current_index - 1) as usize) {
                    if let Some(entry_id) = entry.get("id").and_then(|v| v.as_i64()) {
                        self.send_cdp_command(
                            profile_name,
                            "Page.navigateToHistoryEntry",
                            serde_json::json!({ "entryId": entry_id }),
                        )
                        .await?;
                    }
                }
            }
        }
        Ok(())
    }

    /// Go forward in history
    pub async fn go_forward(&self, profile_name: Option<&str>) -> Result<()> {
        let history = self
            .send_cdp_command(profile_name, "Page.getNavigationHistory", serde_json::json!({}))
            .await?;

        let current_index = history.get("currentIndex").and_then(|v| v.as_i64()).unwrap_or(0);
        let entries = history.get("entries").and_then(|v| v.as_array());
        if let Some(entries) = entries {
            if let Some(entry) = entries.get((current_index + 1) as usize) {
                if let Some(entry_id) = entry.get("id").and_then(|v| v.as_i64()) {
                    self.send_cdp_command(
                        profile_name,
                        "Page.navigateToHistoryEntry",
                        serde_json::json!({ "entryId": entry_id }),
                    )
                    .await?;
                }
            }
        }
        Ok(())
    }

    /// Reload current page
    pub async fn reload(&self, profile_name: Option<&str>) -> Result<()> {
        self.send_cdp_command(profile_name, "Page.reload", serde_json::json!({}))
            .await?;
        Ok(())
    }

    /// Wait for element to appear
    pub async fn wait_for_element(&self, profile_name: Option<&str>, selector: &str, timeout_ms: u64) -> Result<()> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_millis(timeout_ms);

        loop {
            let js = format!(
                "document.querySelector({}) !== null",
                serde_json::to_string(selector)?
            );
            let found = self.eval_on_page(profile_name, &js).await?;

            if found.as_bool().unwrap_or(false) {
                return Ok(());
            }

            if start.elapsed() > timeout {
                return Err(ActionbookError::Timeout(format!(
                    "Element '{}' not found within {}ms",
                    selector, timeout_ms
                )));
            }

            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }

    /// Wait for navigation to complete
    pub async fn wait_for_navigation(&self, profile_name: Option<&str>, timeout_ms: u64) -> Result<String> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_millis(timeout_ms);

        // Get initial URL
        let initial_url = self
            .eval_on_page(profile_name, "document.location.href")
            .await?
            .as_str()
            .unwrap_or("")
            .to_string();

        loop {
            // Check document ready state
            let ready_state = self
                .eval_on_page(profile_name, "document.readyState")
                .await?;

            let current_url = self
                .eval_on_page(profile_name, "document.location.href")
                .await?
                .as_str()
                .unwrap_or("")
                .to_string();

            if ready_state.as_str() == Some("complete") && current_url != initial_url {
                return Ok(current_url);
            }

            if start.elapsed() > timeout {
                return Err(ActionbookError::Timeout("Navigation timeout".to_string()));
            }

            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }

    /// Select an option from dropdown
    pub async fn select_on_page(&self, profile_name: Option<&str>, selector: &str, value: &str) -> Result<()> {
        let js = format!(
            r#"
            (function() {{
                const el = document.querySelector({});
                if (!el || el.tagName !== 'SELECT') return false;
                el.value = {};
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return true;
            }})()
            "#,
            serde_json::to_string(selector)?,
            serde_json::to_string(value)?
        );

        let selected = self.eval_on_page(profile_name, &js).await?;
        if !selected.as_bool().unwrap_or(false) {
            return Err(ActionbookError::ElementNotFound(selector.to_string()));
        }
        Ok(())
    }

    /// Hover over an element
    pub async fn hover_on_page(&self, profile_name: Option<&str>, selector: &str) -> Result<()> {
        // Get element coordinates
        let js = format!(
            r#"
            (function() {{
                const el = document.querySelector({});
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return {{
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                }};
            }})()
            "#,
            serde_json::to_string(selector)?
        );

        let coords = self.eval_on_page(profile_name, &js).await?;
        if coords.is_null() {
            return Err(ActionbookError::ElementNotFound(selector.to_string()));
        }

        let x = coords.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let y = coords.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);

        self.send_cdp_command(
            profile_name,
            "Input.dispatchMouseEvent",
            serde_json::json!({
                "type": "mouseMoved",
                "x": x,
                "y": y
            }),
        )
        .await?;

        Ok(())
    }

    /// Focus on an element
    pub async fn focus_on_page(&self, profile_name: Option<&str>, selector: &str) -> Result<()> {
        let js = format!(
            r#"
            (function() {{
                const el = document.querySelector({});
                if (!el) return false;
                el.focus();
                return true;
            }})()
            "#,
            serde_json::to_string(selector)?
        );

        let focused = self.eval_on_page(profile_name, &js).await?;
        if !focused.as_bool().unwrap_or(false) {
            return Err(ActionbookError::ElementNotFound(selector.to_string()));
        }
        Ok(())
    }

    /// Press a keyboard key
    pub async fn press_key(&self, profile_name: Option<&str>, key: &str) -> Result<()> {
        // Map common key names to CDP key codes
        let (key_code, text) = match key.to_lowercase().as_str() {
            "enter" | "return" => ("Enter", "\r"),
            "tab" => ("Tab", "\t"),
            "escape" | "esc" => ("Escape", ""),
            "backspace" => ("Backspace", ""),
            "delete" => ("Delete", ""),
            "arrowup" | "up" => ("ArrowUp", ""),
            "arrowdown" | "down" => ("ArrowDown", ""),
            "arrowleft" | "left" => ("ArrowLeft", ""),
            "arrowright" | "right" => ("ArrowRight", ""),
            "home" => ("Home", ""),
            "end" => ("End", ""),
            "pageup" => ("PageUp", ""),
            "pagedown" => ("PageDown", ""),
            "space" => ("Space", " "),
            _ => (key, key),
        };

        self.send_cdp_command(
            profile_name,
            "Input.dispatchKeyEvent",
            serde_json::json!({
                "type": "keyDown",
                "key": key_code,
                "text": text
            }),
        )
        .await?;

        self.send_cdp_command(
            profile_name,
            "Input.dispatchKeyEvent",
            serde_json::json!({
                "type": "keyUp",
                "key": key_code
            }),
        )
        .await?;

        Ok(())
    }

    /// Get page HTML
    pub async fn get_html(&self, profile_name: Option<&str>, selector: Option<&str>) -> Result<String> {
        let js = match selector {
            Some(sel) => format!(
                r#"
                (function() {{
                    const el = document.querySelector({});
                    return el ? el.outerHTML : null;
                }})()
                "#,
                serde_json::to_string(sel)?
            ),
            None => "document.documentElement.outerHTML".to_string(),
        };

        let html = self.eval_on_page(profile_name, &js).await?;
        match html {
            serde_json::Value::String(s) => Ok(s),
            serde_json::Value::Null => Err(ActionbookError::ElementNotFound(
                selector.unwrap_or("document").to_string(),
            )),
            _ => Ok(html.to_string()),
        }
    }

    /// Get page text content
    pub async fn get_text(&self, profile_name: Option<&str>, selector: Option<&str>) -> Result<String> {
        let js = match selector {
            Some(sel) => format!(
                r#"
                (function() {{
                    const el = document.querySelector({});
                    return el ? el.innerText : null;
                }})()
                "#,
                serde_json::to_string(sel)?
            ),
            None => "document.body.innerText".to_string(),
        };

        let text = self.eval_on_page(profile_name, &js).await?;
        match text {
            serde_json::Value::String(s) => Ok(s),
            serde_json::Value::Null => Err(ActionbookError::ElementNotFound(
                selector.unwrap_or("body").to_string(),
            )),
            _ => Ok(text.to_string()),
        }
    }

    /// Get all cookies
    pub async fn get_cookies(&self, profile_name: Option<&str>) -> Result<Vec<serde_json::Value>> {
        let result = self
            .send_cdp_command(profile_name, "Network.getAllCookies", serde_json::json!({}))
            .await?;

        let cookies = result
            .get("cookies")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        Ok(cookies)
    }

    /// Set a cookie
    pub async fn set_cookie(
        &self,
        profile_name: Option<&str>,
        name: &str,
        value: &str,
        domain: Option<&str>,
    ) -> Result<()> {
        let mut params = serde_json::json!({
            "name": name,
            "value": value
        });

        if let Some(d) = domain {
            params["domain"] = serde_json::json!(d);
        } else {
            // Get current domain
            let url = self.eval_on_page(profile_name, "document.location.href").await?;
            if let Some(url_str) = url.as_str() {
                params["url"] = serde_json::json!(url_str);
            }
        }

        self.send_cdp_command(profile_name, "Network.setCookie", params)
            .await?;
        Ok(())
    }

    /// Delete a cookie
    pub async fn delete_cookie(&self, profile_name: Option<&str>, name: &str) -> Result<()> {
        // Get current URL for domain
        let url = self.eval_on_page(profile_name, "document.location.href").await?;
        let url_str = url.as_str().unwrap_or("");

        self.send_cdp_command(
            profile_name,
            "Network.deleteCookies",
            serde_json::json!({
                "name": name,
                "url": url_str
            }),
        )
        .await?;
        Ok(())
    }

    /// Clear all cookies
    pub async fn clear_cookies(&self, profile_name: Option<&str>) -> Result<()> {
        self.send_cdp_command(profile_name, "Network.clearBrowserCookies", serde_json::json!({}))
            .await?;
        Ok(())
    }

    /// Get viewport dimensions
    pub async fn get_viewport(&self, profile_name: Option<&str>) -> Result<(f64, f64)> {
        let js = r#"
            (function() {
                return {
                    width: window.innerWidth,
                    height: window.innerHeight
                };
            })()
        "#;

        let result = self.eval_on_page(profile_name, js).await?;
        let width = result.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let height = result.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0);

        Ok((width, height))
    }

    /// Inspect DOM element at coordinates
    pub async fn inspect_at(&self, profile_name: Option<&str>, x: f64, y: f64) -> Result<serde_json::Value> {
        // First, move mouse to the coordinates
        self.send_cdp_command(
            profile_name,
            "Input.dispatchMouseEvent",
            serde_json::json!({
                "type": "mouseMoved",
                "x": x,
                "y": y
            }),
        )
        .await?;

        // Then inspect the element
        let js = format!(
            r#"
            (function() {{
                const x = {x};
                const y = {y};
                const element = document.elementFromPoint(x, y);

                if (!element) {{
                    return {{
                        found: false,
                        message: 'No element found at coordinates'
                    }};
                }}

                // Get computed style for interactivity check
                const computedStyles = window.getComputedStyle(element);

                // Get bounding box
                const rect = element.getBoundingClientRect();

                // Get parent hierarchy for selector context (up to 3 levels)
                const parents = [];
                let parent = element.parentElement;
                let level = 0;
                while (parent && level < 3) {{
                    const textContent = parent.textContent?.trim() || '';
                    parents.push({{
                        tagName: parent.tagName.toLowerCase(),
                        className: parent.className || '',
                        id: parent.id || '',
                        textContent: textContent.length > 50 ? textContent.substring(0, 50) + '...' : textContent,
                    }});
                    parent = parent.parentElement;
                    level++;
                }}

                // Get all attributes for comprehensive selectors
                const attributes = {{}};
                for (const attr of element.attributes) {{
                    attributes[attr.name] = attr.value;
                }}

                const elementOuterHTML = element.outerHTML;
                const elementTextContent = element.textContent?.trim() || '';

                // Build suggested selectors
                const selectors = [];
                if (element.id) {{
                    selectors.push('#' + element.id);
                }}
                if (element.getAttribute('data-testid')) {{
                    selectors.push('[data-testid=\"' + element.getAttribute('data-testid') + '\"]');
                }}
                if (element.getAttribute('aria-label')) {{
                    selectors.push('[aria-label=\"' + element.getAttribute('aria-label') + '\"]');
                }}
                if (element.className && typeof element.className === 'string') {{
                    const classes = element.className.split(' ').filter(c => c.length > 0);
                    if (classes.length > 0) {{
                        selectors.push(element.tagName.toLowerCase() + '.' + classes.join('.'));
                    }}
                }}

                return {{
                    found: true,
                    tagName: element.tagName.toLowerCase(),
                    id: element.id || null,
                    className: element.className || null,
                    textContent: elementTextContent.length > 200 ? elementTextContent.substring(0, 200) + '...' : elementTextContent,
                    attributes: attributes,
                    outerHTML: elementOuterHTML.length > 2000 ? elementOuterHTML.substring(0, 2000) + '...' : elementOuterHTML,
                    boundingBox: {{
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height
                    }},
                    isInteractive: ['a', 'button', 'input', 'select', 'textarea', 'label'].includes(element.tagName.toLowerCase()) ||
                                  element.onclick !== null ||
                                  element.role === 'button' ||
                                  element.hasAttribute('onclick') ||
                                  computedStyles.cursor === 'pointer',
                    suggestedSelectors: selectors,
                    parents: parents
                }};
            }})()
            "#,
            x = x,
            y = y
        );

        self.eval_on_page(profile_name, &js).await
    }

    /// Get browser status for a profile
    pub async fn get_status(&self, profile_name: Option<&str>) -> SessionStatus {
        let profile_name = profile_name.unwrap_or("default");

        if let Some(state) = self.load_session_state(profile_name) {
            if self.is_session_alive(&state).await {
                SessionStatus::Running {
                    profile: profile_name.to_string(),
                    cdp_port: state.cdp_port,
                    cdp_url: state.cdp_url,
                }
            } else {
                SessionStatus::Stale {
                    profile: profile_name.to_string(),
                }
            }
        } else {
            SessionStatus::NotRunning {
                profile: profile_name.to_string(),
            }
        }
    }
}

#[derive(Debug)]
pub enum SessionStatus {
    Running {
        profile: String,
        cdp_port: u16,
        cdp_url: String,
    },
    Stale {
        profile: String,
    },
    NotRunning {
        profile: String,
    },
}
