pub mod api_key;
pub mod browser_cfg;
pub mod detect;
pub mod mode;
pub mod templates;

use std::time::Instant;

use colored::Colorize;
use dialoguer::Select;

use crate::api::ApiClient;
use crate::cli::{BrowserMode, Cli, SetupTarget};
use crate::config::Config;
use crate::error::{ActionbookError, Result};

/// Grouped arguments for the setup command.
pub struct SetupArgs<'a> {
    pub target: Option<SetupTarget>,
    pub api_key: Option<&'a str>,
    pub browser: Option<BrowserMode>,
    pub mode: Option<&'a [SetupTarget]>,
    pub non_interactive: bool,
    pub force: bool,
    pub reset: bool,
}

/// Run the setup wizard. Orchestrates all steps in order.
///
/// Quick mode: if `--target` is provided without other flags, only generate
/// integration files for the specified target(s), skipping the full wizard.
pub async fn run(cli: &Cli, args: SetupArgs<'_>) -> Result<()> {
    // Quick mode: --target only → generate integration files and exit
    if let Some(t) = args.target {
        return run_target_only(cli, t, args.force, args.non_interactive).await;
    }

    // Handle existing config (re-run protection)
    let mut config = handle_existing_config(cli, args.non_interactive, args.reset)?;

    // Welcome + environment detection
    if !cli.json {
        print_welcome();
    }
    let env = detect::detect_environment();
    detect::print_environment_report(&env, cli.json);

    // API Key
    api_key::configure_api_key(cli, &env, args.api_key, args.non_interactive, &mut config).await?;

    // Browser
    browser_cfg::configure_browser(cli, &env, args.browser, args.non_interactive, &mut config)?;

    // Integration + file generation
    let targets = mode::select_modes(cli, &env, args.mode, args.non_interactive)?;
    let results =
        mode::generate_integration_files(cli, &targets, args.force, args.non_interactive)?;

    // Save configuration
    config.save()?;
    if !cli.json {
        println!(
            "\n  {} Configuration saved to {}",
            "✓".green(),
            Config::config_path().display()
        );
    }

    // Health check (API connectivity)
    run_health_check(cli, &config).await;

    // Completion summary
    print_completion(cli, &config, &results);

    Ok(())
}

/// Quick mode: only generate integration files for the specified target.
async fn run_target_only(
    cli: &Cli,
    target: SetupTarget,
    force: bool,
    non_interactive: bool,
) -> Result<()> {
    let targets = match target {
        SetupTarget::All => vec![SetupTarget::Claude, SetupTarget::Cursor, SetupTarget::Codex],
        other => vec![other],
    };

    if !cli.json {
        println!("\n  {} Generating integration files...\n", "→".bold());
    }

    let results = mode::generate_integration_files(cli, &targets, force, non_interactive)?;

    if cli.json {
        let summary: Vec<serde_json::Value> = results
            .iter()
            .map(|r| {
                serde_json::json!({
                    "target": mode::target_display_name(&r.target),
                    "path": r.path.display().to_string(),
                    "status": format!("{}", r.status),
                })
            })
            .collect();
        println!(
            "{}",
            serde_json::json!({
                "command": "setup",
                "mode": "target_only",
                "results": summary,
            })
        );
    } else {
        println!("\n  {}", "Done!".green().bold());
    }

    Ok(())
}

/// Handle re-run protection: detect existing config and offer choices.
fn handle_existing_config(cli: &Cli, non_interactive: bool, reset: bool) -> Result<Config> {
    if reset {
        if !cli.json {
            println!("  {} Resetting configuration...", "→".bold());
        }
        return Ok(Config::default());
    }

    let config_exists = Config::config_path().exists();

    if !config_exists {
        return Ok(Config::default());
    }

    // Load existing config
    let existing = Config::load()?;

    if non_interactive {
        // Non-interactive: reuse existing config as defaults
        return Ok(existing);
    }

    if !cli.json {
        println!("\n  {} Existing configuration found\n", "ℹ".blue());
    }

    let choices = vec![
        "Re-run setup (current values as defaults)",
        "Reset and start fresh",
        "Cancel",
    ];

    let selection = Select::new()
        .with_prompt("  What would you like to do?")
        .items(&choices)
        .default(0)
        .interact()
        .map_err(|e| ActionbookError::SetupError(format!("Prompt failed: {}", e)))?;

    match selection {
        0 => Ok(existing),
        1 => {
            if !cli.json {
                println!("  {} Starting fresh...", "→".bold());
            }
            Ok(Config::default())
        }
        _ => Err(ActionbookError::SetupError("Setup cancelled.".to_string())),
    }
}

/// Print the welcome banner with Actionbook logo.
fn print_welcome() {
    println!();
    println!(
        "{}",
        r#"
     _        _   _             _                 _
    / \   ___| |_(_) ___  _ __ | |__   ___   ___ | | __
   / _ \ / __| __| |/ _ \| '_ \| '_ \ / _ \ / _ \| |/ /
  / ___ \ (__| |_| | (_) | | | | |_) | (_) | (_) |   <
 /_/   \_\___|\__|_|\___/|_| |_|_.__/ \___/ \___/|_|\_\
"#
        .cyan()
    );
    println!(
        "  {}  {}\n",
        format!("v{}", env!("CARGO_PKG_VERSION")).dimmed(),
        "Setup Wizard".bold()
    );
}

/// Run a health check by testing API connectivity.
async fn run_health_check(cli: &Cli, config: &Config) {
    if !cli.json {
        println!("\n  {}\n", "Health Check".cyan().bold());
    }

    // API key + connectivity check
    if config.api.api_key.is_none() {
        // No API key configured — skip connectivity test
        if cli.json {
            println!(
                "{}",
                serde_json::json!({
                    "step": "health_check",
                    "api_key": "not_configured",
                })
            );
        } else {
            println!(
                "  {} API key not configured — run {} to add it later",
                "−".yellow(),
                "actionbook config set api.api_key <your-key>".cyan()
            );
        }
    } else {
        // API key present — test connectivity
        let client = match ApiClient::from_config(config) {
            Ok(c) => Some(c),
            Err(e) => {
                let err_msg = e.to_string();
                if cli.json {
                    println!(
                        "{}",
                        serde_json::json!({
                            "step": "health_check",
                            "api_key": "configured",
                            "api_connection": "failed",
                            "error": err_msg,
                        })
                    );
                } else {
                    println!(
                        "  {} API client creation failed: {}",
                        "✗".red(),
                        err_msg.dimmed()
                    );
                }
                None
            }
        };

        if let Some(client) = client {
            let start = Instant::now();
            match client.list_sources(Some(1)).await {
                Ok(_) => {
                    let elapsed = start.elapsed().as_millis();
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::json!({
                                "step": "health_check",
                                "api_key": "configured",
                                "api_connection": "ok",
                                "latency_ms": elapsed,
                            })
                        );
                    } else {
                        println!("  {} API connection ({}ms)", "✓".green(), elapsed);
                    }
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    if cli.json {
                        println!(
                            "{}",
                            serde_json::json!({
                                "step": "health_check",
                                "api_key": "configured",
                                "api_connection": "failed",
                                "error": err_msg,
                            })
                        );
                    } else {
                        println!(
                            "  {} API connection failed: {}",
                            "✗".red(),
                            err_msg.dimmed()
                        );
                        println!(
                            "    {}",
                            "Check your API key and network connection.".dimmed()
                        );
                    }
                }
            }
        }
    }

    // Config file check
    let config_path = Config::config_path();
    if config_path.exists() {
        if cli.json {
            println!(
                "{}",
                serde_json::json!({
                    "step": "health_check",
                    "config_file": "ok",
                    "path": config_path.display().to_string(),
                })
            );
        } else {
            println!("  {} Config saved", "✓".green());
        }
    }
}

/// Print the completion summary with next steps.
fn print_completion(cli: &Cli, config: &Config, results: &[mode::TargetResult]) {
    if cli.json {
        let file_results: Vec<serde_json::Value> = results
            .iter()
            .map(|r| {
                serde_json::json!({
                    "target": mode::target_display_name(&r.target),
                    "path": r.path.display().to_string(),
                    "status": format!("{}", r.status),
                })
            })
            .collect();

        let mode_names: Vec<&str> = results
            .iter()
            .map(|r| mode::target_display_name(&r.target))
            .collect();

        println!(
            "{}",
            serde_json::json!({
                "command": "setup",
                "status": "complete",
                "config_path": Config::config_path().display().to_string(),
                "browser": config.browser.executable.as_deref().unwrap_or("built-in"),
                "headless": config.browser.headless,
                "modes": mode_names,
                "files": file_results,
            })
        );
        return;
    }

    let browser_display = config.browser.executable.as_deref().unwrap_or("built-in");

    let mode_names: Vec<&str> = results
        .iter()
        .map(|r| mode::target_display_name(&r.target))
        .collect();
    let modes_str = if mode_names.is_empty() {
        "Standalone".to_string()
    } else {
        mode_names.join(", ")
    };

    println!();
    println!("  {} {}", "✓".green().bold(), "Actionbook is ready!".bold());
    println!();
    println!(
        "  Config:  {}",
        Config::config_path().display().to_string().dimmed()
    );
    println!("  Browser: {}", browser_display);
    println!("  Modes:   {}", modes_str);
    println!();
    println!("  Quick start:");
    println!("    $ {}", "actionbook search \"<goal>\" --json".cyan());
    println!("    $ {}", "actionbook get \"<area_id>\" --json".cyan());
    println!();
}
