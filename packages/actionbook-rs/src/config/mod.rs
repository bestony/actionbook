mod profile;

pub use profile::ProfileConfig;

use std::collections::HashMap;
use std::path::PathBuf;

use figment::providers::{Env, Format, Serialized, Toml};
use figment::Figment;
use serde::{Deserialize, Serialize};

use crate::error::{ActionbookError, Result};

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// API configuration
    #[serde(default)]
    pub api: ApiConfig,

    /// Browser configuration
    #[serde(default)]
    pub browser: BrowserConfig,

    /// Named profiles
    #[serde(default)]
    pub profiles: HashMap<String, ProfileConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiConfig {
    /// API base URL
    #[serde(default = "default_api_url")]
    pub base_url: String,

    /// API key
    pub api_key: Option<String>,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            base_url: default_api_url(),
            api_key: None,
        }
    }
}

fn default_api_url() -> String {
    "https://api.actionbook.dev".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserConfig {
    /// Browser executable path (overrides auto-discovery)
    pub executable: Option<String>,

    /// Default profile name
    #[serde(default = "default_profile_name")]
    pub default_profile: String,

    /// Default headless mode
    #[serde(default)]
    pub headless: bool,
}

impl Default for BrowserConfig {
    fn default() -> Self {
        Self {
            executable: None,
            default_profile: default_profile_name(),
            headless: false,
        }
    }
}

fn default_profile_name() -> String {
    "default".to_string()
}

impl Default for Config {
    fn default() -> Self {
        let mut profiles = HashMap::new();
        profiles.insert("default".to_string(), ProfileConfig::default());

        Self {
            api: ApiConfig::default(),
            browser: BrowserConfig::default(),
            profiles,
        }
    }
}

impl Config {
    /// Load configuration from all sources (file, env, defaults)
    pub fn load() -> Result<Self> {
        let config_path = Self::config_path();

        let config: Config = Figment::new()
            // Start with defaults
            .merge(Serialized::defaults(Config::default()))
            // Merge config file if exists
            .merge(Toml::file(&config_path))
            // Merge environment variables (ACTIONBOOK_*)
            .merge(Env::prefixed("ACTIONBOOK_").split("_"))
            .extract()
            .map_err(|e| ActionbookError::ConfigError(e.to_string()))?;

        Ok(config)
    }

    /// Get the configuration file path
    pub fn config_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("actionbook")
            .join("config.toml")
    }

    /// Save configuration to file
    pub fn save(&self) -> Result<()> {
        let path = Self::config_path();

        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let content = toml::to_string_pretty(self)
            .map_err(|e| ActionbookError::ConfigError(e.to_string()))?;

        std::fs::write(path, content)?;
        Ok(())
    }

    /// Get a profile by name, falling back to default
    pub fn get_profile(&self, name: &str) -> Result<ProfileConfig> {
        // First check named profiles
        if let Some(profile) = self.profiles.get(name) {
            return Ok(profile.clone());
        }

        // If asking for "default" and it doesn't exist, create one
        if name == "default" {
            let mut profile = ProfileConfig::default();

            // Apply browser config defaults
            if let Some(ref exe) = self.browser.executable {
                profile.browser_path = Some(exe.clone());
            }
            profile.headless = self.browser.headless;

            return Ok(profile);
        }

        Err(ActionbookError::ProfileNotFound(name.to_string()))
    }

    /// Add or update a profile
    pub fn set_profile(&mut self, name: &str, profile: ProfileConfig) {
        self.profiles.insert(name.to_string(), profile);
    }

    /// Remove a profile
    pub fn remove_profile(&mut self, name: &str) -> Result<()> {
        if name == "default" {
            return Err(ActionbookError::ConfigError(
                "Cannot remove the default profile".to_string(),
            ));
        }

        self.profiles
            .remove(name)
            .ok_or_else(|| ActionbookError::ProfileNotFound(name.to_string()))?;

        Ok(())
    }
}
