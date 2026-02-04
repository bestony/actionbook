use std::fs;
use std::time::Duration;

use colored::Colorize;
use futures::StreamExt;
use tokio::time::timeout;

use crate::browser::{discover_all_browsers, SessionManager, SessionStatus};
use crate::cli::{BrowserCommands, Cli, CookiesCommands};
use crate::config::Config;
use crate::error::{ActionbookError, Result};

pub async fn run(cli: &Cli, command: &BrowserCommands) -> Result<()> {
    let config = Config::load()?;

    match command {
        BrowserCommands::Status => status(cli, &config).await,
        BrowserCommands::Open { url } => open(cli, &config, url).await,
        BrowserCommands::Goto { url, timeout: t } => goto(cli, &config, url, *t).await,
        BrowserCommands::Back => back(cli, &config).await,
        BrowserCommands::Forward => forward(cli, &config).await,
        BrowserCommands::Reload => reload(cli, &config).await,
        BrowserCommands::Pages => pages(cli, &config).await,
        BrowserCommands::Switch { page_id } => switch(cli, &config, page_id).await,
        BrowserCommands::Wait { selector, timeout: t } => wait(cli, &config, selector, *t).await,
        BrowserCommands::WaitNav { timeout: t } => wait_nav(cli, &config, *t).await,
        BrowserCommands::Click { selector, wait: w } => click(cli, &config, selector, *w).await,
        BrowserCommands::Type { selector, text, wait: w } => type_text(cli, &config, selector, text, *w).await,
        BrowserCommands::Fill { selector, text, wait: w } => fill(cli, &config, selector, text, *w).await,
        BrowserCommands::Select { selector, value } => select(cli, &config, selector, value).await,
        BrowserCommands::Hover { selector } => hover(cli, &config, selector).await,
        BrowserCommands::Focus { selector } => focus(cli, &config, selector).await,
        BrowserCommands::Press { key } => press(cli, &config, key).await,
        BrowserCommands::Screenshot { path, full_page } => screenshot(cli, &config, path, *full_page).await,
        BrowserCommands::Pdf { path } => pdf(cli, &config, path).await,
        BrowserCommands::Eval { code } => eval(cli, &config, code).await,
        BrowserCommands::Html { selector } => html(cli, &config, selector.as_deref()).await,
        BrowserCommands::Text { selector } => text(cli, &config, selector.as_deref()).await,
        BrowserCommands::Snapshot => snapshot(cli, &config).await,
        BrowserCommands::Inspect { x, y, desc } => inspect(cli, &config, *x, *y, desc.as_deref()).await,
        BrowserCommands::Viewport => viewport(cli, &config).await,
        BrowserCommands::Cookies { command } => cookies(cli, &config, command).await,
        BrowserCommands::Close => close(cli, &config).await,
        BrowserCommands::Restart => restart(cli, &config).await,
        BrowserCommands::Connect { endpoint } => connect(cli, &config, endpoint).await,
    }
}

async fn status(cli: &Cli, config: &Config) -> Result<()> {
    // Show detected browsers
    println!("{}", "Detected Browsers:".bold());
    let browsers = discover_all_browsers();
    if browsers.is_empty() {
        println!("  {} No browsers found", "!".yellow());
    } else {
        for browser in browsers {
            println!(
                "  {} {} {}",
                "✓".green(),
                browser.browser_type.name(),
                browser
                    .version
                    .map(|v| format!("(v{})", v))
                    .unwrap_or_default()
                    .dimmed()
            );
            println!("    {}", browser.path.display().to_string().dimmed());
        }
    }

    println!();

    // Show session status
    let session_manager = SessionManager::new(config.clone());
    let profile_name = cli.profile.as_deref();
    let status = session_manager.get_status(profile_name).await;

    println!("{}", "Session Status:".bold());
    match status {
        SessionStatus::Running {
            profile,
            cdp_port,
            cdp_url,
        } => {
            println!("  {} Profile: {}", "✓".green(), profile.cyan());
            println!("  {} CDP Port: {}", "✓".green(), cdp_port);
            println!("  {} CDP URL: {}", "✓".green(), cdp_url.dimmed());

            // Show open pages
            if let Ok(pages) = session_manager.get_pages(Some(&profile)).await {
                println!();
                println!("{}", "Open Pages:".bold());
                for (i, page) in pages.iter().enumerate() {
                    println!(
                        "  {}. {} {}",
                        (i + 1).to_string().cyan(),
                        page.title.bold(),
                        format!("({})", page.id).dimmed()
                    );
                    println!("     {}", page.url.dimmed());
                }
            }
        }
        SessionStatus::Stale { profile } => {
            println!(
                "  {} Profile: {} (stale session)",
                "!".yellow(),
                profile.cyan()
            );
        }
        SessionStatus::NotRunning { profile } => {
            println!(
                "  {} Profile: {} (not running)",
                "○".dimmed(),
                profile.cyan()
            );
        }
    }

    Ok(())
}

async fn open(cli: &Cli, config: &Config, url: &str) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    let (browser, mut handler) = session_manager
        .get_or_create_session(cli.profile.as_deref())
        .await?;

    // Spawn handler in background
    tokio::spawn(async move {
        while handler.next().await.is_some() {}
    });

    // Navigate to URL
    let page = browser.new_page(url).await.map_err(|e| {
        ActionbookError::Other(format!("Failed to open page: {}", e))
    })?;

    // Wait for page to load
    let _ = timeout(Duration::from_secs(30), page.wait_for_navigation()).await;

    // Get page title
    let title = page.get_title().await.ok().flatten().unwrap_or_default();

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "url": url,
                "title": title
            })
        );
    } else {
        println!("{} {}", "✓".green(), title.bold());
        println!("  {}", url.dimmed());
    }

    Ok(())
}

async fn goto(cli: &Cli, config: &Config, url: &str, _timeout_ms: u64) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager.goto(cli.profile.as_deref(), url).await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "url": url
            })
        );
    } else {
        println!("{} Navigated to: {}", "✓".green(), url);
    }

    Ok(())
}

async fn back(cli: &Cli, config: &Config) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager.go_back(cli.profile.as_deref()).await?;

    if cli.json {
        println!("{}", serde_json::json!({ "success": true }));
    } else {
        println!("{} Went back", "✓".green());
    }

    Ok(())
}

async fn forward(cli: &Cli, config: &Config) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager.go_forward(cli.profile.as_deref()).await?;

    if cli.json {
        println!("{}", serde_json::json!({ "success": true }));
    } else {
        println!("{} Went forward", "✓".green());
    }

    Ok(())
}

async fn reload(cli: &Cli, config: &Config) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager.reload(cli.profile.as_deref()).await?;

    if cli.json {
        println!("{}", serde_json::json!({ "success": true }));
    } else {
        println!("{} Page reloaded", "✓".green());
    }

    Ok(())
}

async fn pages(cli: &Cli, config: &Config) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    let pages = session_manager.get_pages(cli.profile.as_deref()).await?;

    if cli.json {
        let pages_json: Vec<_> = pages
            .iter()
            .map(|p| {
                serde_json::json!({
                    "id": p.id,
                    "title": p.title,
                    "url": p.url
                })
            })
            .collect();
        println!("{}", serde_json::to_string_pretty(&pages_json)?);
    } else {
        if pages.is_empty() {
            println!("{} No pages open", "!".yellow());
        } else {
            println!("{} {} pages open\n", "✓".green(), pages.len());
            for (i, page) in pages.iter().enumerate() {
                println!(
                    "{}. {} {}",
                    (i + 1).to_string().cyan(),
                    page.title.bold(),
                    format!("({})", &page.id[..8.min(page.id.len())]).dimmed()
                );
                println!("   {}", page.url.dimmed());
            }
        }
    }

    Ok(())
}

async fn switch(_cli: &Cli, _config: &Config, page_id: &str) -> Result<()> {
    // Note: This would require storing the active page ID in session state
    // For now, we just acknowledge the command
    println!(
        "{} Page switching requires session state management (not yet implemented)",
        "!".yellow()
    );
    println!("  Requested page: {}", page_id);
    Ok(())
}

async fn wait(cli: &Cli, config: &Config, selector: &str, timeout_ms: u64) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager
        .wait_for_element(cli.profile.as_deref(), selector, timeout_ms)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "selector": selector
            })
        );
    } else {
        println!("{} Element found: {}", "✓".green(), selector);
    }

    Ok(())
}

async fn wait_nav(cli: &Cli, config: &Config, timeout_ms: u64) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    let new_url = session_manager
        .wait_for_navigation(cli.profile.as_deref(), timeout_ms)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "url": new_url
            })
        );
    } else {
        println!("{} Navigation complete: {}", "✓".green(), new_url);
    }

    Ok(())
}

async fn click(cli: &Cli, config: &Config, selector: &str, wait_ms: u64) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());

    if wait_ms > 0 {
        session_manager
            .wait_for_element(cli.profile.as_deref(), selector, wait_ms)
            .await?;
    }

    session_manager
        .click_on_page(cli.profile.as_deref(), selector)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "selector": selector
            })
        );
    } else {
        println!("{} Clicked: {}", "✓".green(), selector);
    }

    Ok(())
}

async fn type_text(cli: &Cli, config: &Config, selector: &str, text: &str, wait_ms: u64) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());

    if wait_ms > 0 {
        session_manager
            .wait_for_element(cli.profile.as_deref(), selector, wait_ms)
            .await?;
    }

    session_manager
        .type_on_page(cli.profile.as_deref(), selector, text)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "selector": selector,
                "text": text
            })
        );
    } else {
        println!("{} Typed into: {}", "✓".green(), selector);
    }

    Ok(())
}

async fn fill(cli: &Cli, config: &Config, selector: &str, text: &str, wait_ms: u64) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());

    if wait_ms > 0 {
        session_manager
            .wait_for_element(cli.profile.as_deref(), selector, wait_ms)
            .await?;
    }

    session_manager
        .fill_on_page(cli.profile.as_deref(), selector, text)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "selector": selector,
                "text": text
            })
        );
    } else {
        println!("{} Filled: {}", "✓".green(), selector);
    }

    Ok(())
}

async fn select(cli: &Cli, config: &Config, selector: &str, value: &str) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager
        .select_on_page(cli.profile.as_deref(), selector, value)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "selector": selector,
                "value": value
            })
        );
    } else {
        println!("{} Selected '{}' in: {}", "✓".green(), value, selector);
    }

    Ok(())
}

async fn hover(cli: &Cli, config: &Config, selector: &str) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager
        .hover_on_page(cli.profile.as_deref(), selector)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "selector": selector
            })
        );
    } else {
        println!("{} Hovered: {}", "✓".green(), selector);
    }

    Ok(())
}

async fn focus(cli: &Cli, config: &Config, selector: &str) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager
        .focus_on_page(cli.profile.as_deref(), selector)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "selector": selector
            })
        );
    } else {
        println!("{} Focused: {}", "✓".green(), selector);
    }

    Ok(())
}

async fn press(cli: &Cli, config: &Config, key: &str) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager
        .press_key(cli.profile.as_deref(), key)
        .await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "key": key
            })
        );
    } else {
        println!("{} Pressed: {}", "✓".green(), key);
    }

    Ok(())
}

async fn screenshot(cli: &Cli, config: &Config, path: &str, full_page: bool) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());

    let screenshot_data = if full_page {
        session_manager
            .screenshot_full_page(cli.profile.as_deref())
            .await?
    } else {
        session_manager
            .screenshot_page(cli.profile.as_deref())
            .await?
    };

    fs::write(path, screenshot_data)?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "path": path,
                "fullPage": full_page
            })
        );
    } else {
        let mode = if full_page { " (full page)" } else { "" };
        println!("{} Screenshot saved{}: {}", "✓".green(), mode, path);
    }

    Ok(())
}

async fn pdf(cli: &Cli, config: &Config, path: &str) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    let pdf_data = session_manager
        .pdf_page(cli.profile.as_deref())
        .await?;

    fs::write(path, pdf_data)?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true,
                "path": path
            })
        );
    } else {
        println!("{} PDF saved: {}", "✓".green(), path);
    }

    Ok(())
}

async fn eval(cli: &Cli, config: &Config, code: &str) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    let value = session_manager
        .eval_on_page(cli.profile.as_deref(), code)
        .await?;

    if cli.json {
        println!("{}", serde_json::to_string_pretty(&value)?);
    } else {
        println!("{}", serde_json::to_string_pretty(&value)?);
    }

    Ok(())
}

async fn html(cli: &Cli, config: &Config, selector: Option<&str>) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    let html = session_manager
        .get_html(cli.profile.as_deref(), selector)
        .await?;

    if cli.json {
        println!("{}", serde_json::json!({ "html": html }));
    } else {
        println!("{}", html);
    }

    Ok(())
}

async fn text(cli: &Cli, config: &Config, selector: Option<&str>) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    let text = session_manager
        .get_text(cli.profile.as_deref(), selector)
        .await?;

    if cli.json {
        println!("{}", serde_json::json!({ "text": text }));
    } else {
        println!("{}", text);
    }

    Ok(())
}

async fn snapshot(cli: &Cli, config: &Config) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());

    // Get accessibility tree via JavaScript
    let js = r#"
        (function() {
            function getAccessibleName(el) {
                return el.getAttribute('aria-label') ||
                       el.getAttribute('alt') ||
                       el.getAttribute('title') ||
                       el.textContent?.trim()?.substring(0, 100) || '';
            }
            function getRole(el) {
                return el.getAttribute('role') ||
                       el.tagName.toLowerCase();
            }
            function walk(el, depth = 0) {
                if (depth > 10) return [];
                const results = [];
                const name = getAccessibleName(el);
                const role = getRole(el);
                if (name || ['button', 'a', 'input', 'select', 'textarea'].includes(el.tagName.toLowerCase())) {
                    results.push({
                        role: role,
                        name: name,
                        tag: el.tagName.toLowerCase()
                    });
                }
                for (const child of el.children) {
                    results.push(...walk(child, depth + 1));
                }
                return results;
            }
            return walk(document.body);
        })()
    "#;

    let value = session_manager
        .eval_on_page(cli.profile.as_deref(), js)
        .await?;

    if cli.json {
        println!("{}", serde_json::to_string_pretty(&value)?);
    } else {
        // Pretty print the accessibility tree
        if let Some(items) = value.as_array() {
            for item in items {
                let role = item.get("role").and_then(|v| v.as_str()).unwrap_or("");
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if !name.is_empty() {
                    println!("[{}] {}", role.cyan(), name);
                }
            }
        }
    }

    Ok(())
}

async fn inspect(cli: &Cli, config: &Config, x: f64, y: f64, desc: Option<&str>) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());

    // Get viewport to validate coordinates
    let (vp_width, vp_height) = session_manager.get_viewport(cli.profile.as_deref()).await?;

    if x < 0.0 || x > vp_width || y < 0.0 || y > vp_height {
        if cli.json {
            println!(
                "{}",
                serde_json::json!({
                    "success": false,
                    "message": format!("Coordinates ({}, {}) are outside viewport bounds ({}x{})", x, y, vp_width, vp_height)
                })
            );
        } else {
            println!(
                "{} Coordinates ({}, {}) are outside viewport bounds ({}x{})",
                "!".yellow(),
                x,
                y,
                vp_width,
                vp_height
            );
        }
        return Ok(());
    }

    let result = session_manager
        .inspect_at(cli.profile.as_deref(), x, y)
        .await?;

    if cli.json {
        let mut output = serde_json::json!({
            "success": true,
            "coordinates": { "x": x, "y": y },
            "viewport": { "width": vp_width, "height": vp_height },
            "inspection": result
        });
        if let Some(d) = desc {
            output["description"] = serde_json::json!(d);
        }
        println!("{}", serde_json::to_string_pretty(&output)?);
    } else {
        let found = result.get("found").and_then(|v| v.as_bool()).unwrap_or(false);

        if !found {
            println!("{} No element found at ({}, {})", "!".yellow(), x, y);
            return Ok(());
        }

        if let Some(d) = desc {
            println!("{} Inspecting: {}\n", "🔍".cyan(), d.bold());
        }

        println!("{} ({}, {}) in {}x{} viewport\n", "📍".cyan(), x, y, vp_width, vp_height);

        // Tag and basic info
        let tag = result.get("tagName").and_then(|v| v.as_str()).unwrap_or("unknown");
        let id = result.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
        let class = result.get("className").and_then(|v| v.as_str()).filter(|s| !s.is_empty());

        print!("{}", "Element: ".bold());
        print!("<{}", tag.cyan());
        if let Some(i) = id {
            print!(" id=\"{}\"", i.green());
        }
        if let Some(c) = class {
            print!(" class=\"{}\"", c.yellow());
        }
        println!(">");

        // Interactive status
        let interactive = result.get("isInteractive").and_then(|v| v.as_bool()).unwrap_or(false);
        if interactive {
            println!("{} Interactive element", "✓".green());
        }

        // Bounding box
        if let Some(bbox) = result.get("boundingBox") {
            let bx = bbox.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let by = bbox.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let bw = bbox.get("width").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let bh = bbox.get("height").and_then(|v| v.as_f64()).unwrap_or(0.0);
            println!(
                "{} x={:.0}, y={:.0}, {}x{}",
                "📐".dimmed(),
                bx,
                by,
                bw as i32,
                bh as i32
            );
        }

        // Text content
        if let Some(text) = result.get("textContent").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            println!("\n{}", "Text:".bold());
            println!("  {}", text.dimmed());
        }

        // Suggested selectors
        if let Some(selectors) = result.get("suggestedSelectors").and_then(|v| v.as_array()) {
            if !selectors.is_empty() {
                println!("\n{}", "Suggested Selectors:".bold());
                for sel in selectors {
                    if let Some(s) = sel.as_str() {
                        println!("  {} {}", "→".cyan(), s);
                    }
                }
            }
        }

        // Attributes
        if let Some(attrs) = result.get("attributes").and_then(|v| v.as_object()) {
            if !attrs.is_empty() {
                println!("\n{}", "Attributes:".bold());
                for (key, value) in attrs {
                    if key != "class" && key != "id" {
                        let val = value.as_str().unwrap_or("");
                        let display_val = if val.len() > 50 {
                            format!("{}...", &val[..50])
                        } else {
                            val.to_string()
                        };
                        println!("  {}={}", key.dimmed(), display_val);
                    }
                }
            }
        }

        // Parent hierarchy
        if let Some(parents) = result.get("parents").and_then(|v| v.as_array()) {
            if !parents.is_empty() {
                println!("\n{}", "Parent Hierarchy:".bold());
                for (i, parent) in parents.iter().enumerate() {
                    let ptag = parent.get("tagName").and_then(|v| v.as_str()).unwrap_or("?");
                    let pid = parent.get("id").and_then(|v| v.as_str()).filter(|s| !s.is_empty());
                    let pclass = parent.get("className").and_then(|v| v.as_str()).filter(|s| !s.is_empty());

                    let indent = "  ".repeat(i + 1);
                    print!("{}↑ <{}", indent, ptag);
                    if let Some(i) = pid {
                        print!(" #{}", i);
                    }
                    if let Some(c) = pclass {
                        let short_class = if c.len() > 30 {
                            format!("{}...", &c[..30])
                        } else {
                            c.to_string()
                        };
                        print!(" .{}", short_class);
                    }
                    println!(">");
                }
            }
        }
    }

    Ok(())
}

async fn viewport(cli: &Cli, config: &Config) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    let (width, height) = session_manager.get_viewport(cli.profile.as_deref()).await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "width": width,
                "height": height
            })
        );
    } else {
        println!("{} {}x{}", "Viewport:".bold(), width as i32, height as i32);
    }

    Ok(())
}

async fn cookies(cli: &Cli, config: &Config, command: &Option<CookiesCommands>) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());

    match command {
        None | Some(CookiesCommands::List) => {
            let cookies = session_manager.get_cookies(cli.profile.as_deref()).await?;

            if cli.json {
                println!("{}", serde_json::to_string_pretty(&cookies)?);
            } else {
                if cookies.is_empty() {
                    println!("{} No cookies", "!".yellow());
                } else {
                    println!("{} {} cookies\n", "✓".green(), cookies.len());
                    for cookie in &cookies {
                        let name = cookie.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let value = cookie.get("value").and_then(|v| v.as_str()).unwrap_or("");
                        let domain = cookie.get("domain").and_then(|v| v.as_str()).unwrap_or("");
                        println!("  {} = {} {}", name.bold(), value, format!("({})", domain).dimmed());
                    }
                }
            }
        }
        Some(CookiesCommands::Get { name }) => {
            let cookies = session_manager.get_cookies(cli.profile.as_deref()).await?;
            let cookie = cookies.iter().find(|c| {
                c.get("name").and_then(|v| v.as_str()) == Some(name)
            });

            if cli.json {
                println!("{}", serde_json::to_string_pretty(&cookie)?);
            } else {
                match cookie {
                    Some(c) => {
                        let value = c.get("value").and_then(|v| v.as_str()).unwrap_or("");
                        println!("{} = {}", name, value);
                    }
                    None => println!("{} Cookie not found: {}", "!".yellow(), name),
                }
            }
        }
        Some(CookiesCommands::Set { name, value, domain }) => {
            session_manager
                .set_cookie(cli.profile.as_deref(), name, value, domain.as_deref())
                .await?;

            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "success": true,
                        "name": name,
                        "value": value
                    })
                );
            } else {
                println!("{} Cookie set: {} = {}", "✓".green(), name, value);
            }
        }
        Some(CookiesCommands::Delete { name }) => {
            session_manager
                .delete_cookie(cli.profile.as_deref(), name)
                .await?;

            if cli.json {
                println!(
                    "{}",
                    serde_json::json!({
                        "success": true,
                        "name": name
                    })
                );
            } else {
                println!("{} Cookie deleted: {}", "✓".green(), name);
            }
        }
        Some(CookiesCommands::Clear) => {
            session_manager
                .clear_cookies(cli.profile.as_deref())
                .await?;

            if cli.json {
                println!("{}", serde_json::json!({ "success": true }));
            } else {
                println!("{} All cookies cleared", "✓".green());
            }
        }
    }

    Ok(())
}

async fn close(cli: &Cli, config: &Config) -> Result<()> {
    let session_manager = SessionManager::new(config.clone());
    session_manager.close_session(cli.profile.as_deref()).await?;

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true
            })
        );
    } else {
        println!("{} Browser closed", "✓".green());
    }

    Ok(())
}

async fn restart(cli: &Cli, config: &Config) -> Result<()> {
    // Close existing session
    close(cli, config).await?;

    // Open a blank page to restart
    let session_manager = SessionManager::new(config.clone());
    let (_browser, mut handler) = session_manager
        .get_or_create_session(cli.profile.as_deref())
        .await?;

    tokio::spawn(async move {
        while handler.next().await.is_some() {}
    });

    if cli.json {
        println!(
            "{}",
            serde_json::json!({
                "success": true
            })
        );
    } else {
        println!("{} Browser restarted", "✓".green());
    }

    Ok(())
}

async fn connect(_cli: &Cli, _config: &Config, endpoint: &str) -> Result<()> {
    // For now, just validate the endpoint
    let url = if endpoint.starts_with("ws://") || endpoint.starts_with("wss://") {
        endpoint.to_string()
    } else if let Ok(port) = endpoint.parse::<u16>() {
        format!("http://127.0.0.1:{}/json/version", port)
    } else {
        return Err(ActionbookError::CdpConnectionFailed(
            "Invalid endpoint. Use a port number or WebSocket URL.".to_string(),
        ));
    };

    println!("{} Connecting to: {}", "✓".green(), url);
    // TODO: Actually establish and persist the connection
    Ok(())
}
