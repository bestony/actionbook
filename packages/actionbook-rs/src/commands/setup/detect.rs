use std::process::Command;

use colored::Colorize;

use crate::browser::{discover_all_browsers, BrowserInfo};
use crate::config::Config;

/// Detected environment information used to pre-fill setup defaults
#[derive(Debug)]
pub struct EnvironmentInfo {
    pub os: String,
    pub arch: String,
    pub shell: Option<String>,
    pub browsers: Vec<BrowserInfo>,
    pub claude_code: bool,
    pub cursor: bool,
    pub codex: bool,
    pub node_version: Option<String>,
    pub existing_config: bool,
    pub existing_api_key: Option<String>,
}

/// Scan the system environment and return detected info
pub fn detect_environment() -> EnvironmentInfo {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let shell = std::env::var("SHELL").ok();
    let browsers = discover_all_browsers();
    let claude_code = detect_claude_code();
    let cursor = detect_cursor();
    let codex = detect_codex();
    let node_version = detect_node_version();
    let existing_config = Config::config_path().exists();
    let existing_api_key = std::env::var("ACTIONBOOK_API_KEY").ok();

    EnvironmentInfo {
        os,
        arch,
        shell,
        browsers,
        claude_code,
        cursor,
        codex,
        node_version,
        existing_config,
        existing_api_key,
    }
}

/// Print a formatted environment report to the terminal
pub fn print_environment_report(env: &EnvironmentInfo, json: bool) {
    if json {
        let browsers_json: Vec<serde_json::Value> = env
            .browsers
            .iter()
            .map(|b| {
                serde_json::json!({
                    "name": b.browser_type.name(),
                    "version": b.version,
                    "path": b.path.display().to_string(),
                })
            })
            .collect();

        let report = serde_json::json!({
            "os": env.os,
            "arch": env.arch,
            "shell": env.shell,
            "browsers": browsers_json,
            "claude_code": env.claude_code,
            "cursor": env.cursor,
            "codex": env.codex,
            "node": env.node_version,
            "existing_config": env.existing_config,
            "existing_api_key": env.existing_api_key.is_some(),
        });
        println!(
            "{}",
            serde_json::to_string_pretty(&report).unwrap_or_default()
        );
        return;
    }

    println!("\n  {} environment...\n", "Detecting".bold());

    // OS
    println!("  {} OS: {} ({})", check_mark(), env.os, env.arch);

    // Shell
    if let Some(ref shell) = env.shell {
        let shell_name = shell.rsplit('/').next().unwrap_or(shell);
        println!("  {} Shell: {}", check_mark(), shell_name);
    } else {
        println!("  {} Shell: {}", empty_mark(), "not detected".dimmed());
    }

    // Browsers
    if env.browsers.is_empty() {
        println!("  {} Browsers: {}", empty_mark(), "none detected".dimmed());
    } else {
        for browser in &env.browsers {
            let version_str = browser
                .version
                .as_deref()
                .map(|v| format!(" v{}", v))
                .unwrap_or_default();
            println!(
                "  {} {}{}",
                check_mark(),
                browser.browser_type.name(),
                version_str
            );
        }
    }

    // AI Tools
    if env.claude_code {
        println!("  {} Claude Code: {}", check_mark(), "detected".green());
    } else {
        println!(
            "  {} Claude Code: {}",
            empty_mark(),
            "not detected".dimmed()
        );
    }

    if env.cursor {
        println!("  {} Cursor: {}", check_mark(), "detected".green());
    } else {
        println!("  {} Cursor: {}", empty_mark(), "not detected".dimmed());
    }

    if env.codex {
        println!("  {} Codex: {}", check_mark(), "detected".green());
    } else {
        println!("  {} Codex: {}", empty_mark(), "not detected".dimmed());
    }

    // Node.js
    if let Some(ref ver) = env.node_version {
        println!("  {} Node.js: {}", check_mark(), ver);
    } else {
        println!("  {} Node.js: {}", empty_mark(), "not detected".dimmed());
    }

    println!();
}

fn check_mark() -> colored::ColoredString {
    "✓".green()
}

fn empty_mark() -> colored::ColoredString {
    "○".dimmed()
}

fn detect_claude_code() -> bool {
    // Check if `claude` binary is in PATH
    if which::which("claude").is_ok() {
        return true;
    }
    // Check if ~/.claude/ directory exists
    if let Some(home) = dirs::home_dir() {
        if home.join(".claude").is_dir() {
            return true;
        }
    }
    false
}

fn detect_cursor() -> bool {
    if let Some(home) = dirs::home_dir() {
        return home.join(".cursor").is_dir();
    }
    false
}

fn detect_codex() -> bool {
    which::which("codex").is_ok()
}

fn detect_node_version() -> Option<String> {
    which::which("node").ok()?;
    let output = Command::new("node").arg("--version").output().ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_environment_returns_valid_struct() {
        let env = detect_environment();
        assert!(!env.os.is_empty());
        assert!(!env.arch.is_empty());
    }

    #[test]
    fn test_print_environment_report_does_not_panic() {
        let env = detect_environment();
        print_environment_report(&env, false);
    }

    #[test]
    fn test_print_environment_report_json_does_not_panic() {
        let env = detect_environment();
        print_environment_report(&env, true);
    }
}
