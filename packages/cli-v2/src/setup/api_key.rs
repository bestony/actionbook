use dialoguer::Password;

use super::detect::EnvironmentInfo;
use super::theme::setup_theme;
use crate::config::ConfigFile;
use crate::error::CliError;

/// Configure the API key with priority: flag > env > config > interactive prompt.
pub(crate) async fn configure_api_key(
    json: bool,
    env: &EnvironmentInfo,
    api_key_flag: Option<&str>,
    non_interactive: bool,
    config: &mut ConfigFile,
) -> Result<(), CliError> {
    let (existing_key, source) = resolve_existing_key(api_key_flag, env, config);

    if let Some(key) = existing_key {
        let key = validate_api_key(&key)?;
        let masked = mask_key(&key);

        if json {
            println!(
                "{}",
                serde_json::json!({
                    "step": "api_key",
                    "status": "detected",
                    "source": source,
                    "masked_key": masked,
                })
            );
        } else {
            println!("  - API key: {} ({masked})", source);
        }

        config.api.api_key = Some(key);
        return Ok(());
    }

    if non_interactive {
        if json {
            println!(
                "{}",
                serde_json::json!({
                    "step": "api_key",
                    "status": "skipped",
                })
            );
        } else {
            println!("  - API key: skipped");
        }
        return Ok(());
    }

    loop {
        let key = Password::with_theme(&setup_theme())
            .with_prompt("API key (leave blank to skip)")
            .allow_empty_password(true)
            .interact()
            .map_err(|e| CliError::Internal(format!("Prompt failed: {e}")))?;

        if key.trim().is_empty() {
            if json {
                println!(
                    "{}",
                    serde_json::json!({
                        "step": "api_key",
                        "status": "skipped",
                    })
                );
            } else {
                println!("  - API key: skipped");
            }
            config.api.api_key = None;
            return Ok(());
        }

        match validate_api_key(&key) {
            Ok(validated) => {
                if json {
                    println!(
                        "{}",
                        serde_json::json!({
                            "step": "api_key",
                            "status": "configured",
                            "masked_key": mask_key(&validated),
                        })
                    );
                } else {
                    println!("  - API key: captured ({})", mask_key(&validated));
                }
                config.api.api_key = Some(validated);
                return Ok(());
            }
            Err(err) => {
                if json {
                    return Err(err);
                }
                println!("  - {err}");
            }
        }
    }
}

fn validate_api_key(key: &str) -> Result<String, CliError> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err(CliError::InvalidArgument(
            "api key cannot be empty".to_string(),
        ));
    }
    if trimmed.chars().any(char::is_whitespace) {
        return Err(CliError::InvalidArgument(
            "api key must not contain whitespace".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

/// Resolve the best available key and its source name.
fn resolve_existing_key(
    flag: Option<&str>,
    env: &EnvironmentInfo,
    config: &ConfigFile,
) -> (Option<String>, &'static str) {
    if let Some(key) = flag {
        return (Some(key.to_string()), "flag");
    }
    if let Some(ref key) = env.existing_api_key {
        return (Some(key.clone()), "env");
    }
    if let Some(ref key) = config.api.api_key {
        return (Some(key.clone()), "config");
    }
    (None, "none")
}

/// Mask an API key for display, showing only first 4 and last 4 chars.
pub(super) fn mask_key(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        return "*".repeat(chars.len());
    }
    let prefix: String = chars[..4].iter().collect();
    let suffix: String = chars[chars.len() - 4..].iter().collect();
    format!("{prefix}...{suffix}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_key_long() {
        assert_eq!(mask_key("abcdefghijklmnop"), "abcd...mnop");
    }

    #[test]
    fn test_mask_key_short() {
        assert_eq!(mask_key("abcd"), "****");
    }

    #[test]
    fn test_mask_key_exactly_8() {
        assert_eq!(mask_key("abcdefgh"), "********");
    }

    #[test]
    fn test_validate_api_key_rejects_whitespace() {
        let err = validate_api_key("sk test").expect_err("whitespace should fail");
        assert_eq!(err.error_code(), "INVALID_ARGUMENT");
    }

    #[test]
    fn test_resolve_flag_wins() {
        let env = EnvironmentInfo {
            os: String::new(),
            arch: String::new(),
            shell: None,
            browsers: vec![],
            npx_available: false,
            node_version: None,
            existing_config: false,
            existing_api_key: Some("env_key".to_string()),
        };
        let config = ConfigFile::default();
        let (key, source) = resolve_existing_key(Some("flag_key"), &env, &config);
        assert_eq!(key.unwrap(), "flag_key");
        assert_eq!(source, "flag");
    }

    #[test]
    fn test_resolve_env_wins_over_config() {
        let env = EnvironmentInfo {
            os: String::new(),
            arch: String::new(),
            shell: None,
            browsers: vec![],
            npx_available: false,
            node_version: None,
            existing_config: false,
            existing_api_key: Some("env_key".to_string()),
        };
        let mut config = ConfigFile::default();
        config.api.api_key = Some("config_key".to_string());
        let (key, source) = resolve_existing_key(None, &env, &config);
        assert_eq!(key.unwrap(), "env_key");
        assert_eq!(source, "env");
    }

    #[test]
    fn test_resolve_config_fallback() {
        let env = EnvironmentInfo {
            os: String::new(),
            arch: String::new(),
            shell: None,
            browsers: vec![],
            npx_available: false,
            node_version: None,
            existing_config: false,
            existing_api_key: None,
        };
        let mut config = ConfigFile::default();
        config.api.api_key = Some("config_key".to_string());
        let (key, source) = resolve_existing_key(None, &env, &config);
        assert_eq!(key.unwrap(), "config_key");
        assert_eq!(source, "config");
    }

    #[test]
    fn test_resolve_none() {
        let env = EnvironmentInfo {
            os: String::new(),
            arch: String::new(),
            shell: None,
            browsers: vec![],
            npx_available: false,
            node_version: None,
            existing_config: false,
            existing_api_key: None,
        };
        let config = ConfigFile::default();
        let (key, source) = resolve_existing_key(None, &env, &config);
        assert!(key.is_none());
        assert_eq!(source, "none");
    }
}
