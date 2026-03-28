use clap::Args;
use serde::{Deserialize, Serialize};

use crate::action_result::ActionResult;
use crate::daemon::registry::SharedRegistry;
use crate::output::ResponseContext;

/// Get current viewport dimensions
#[derive(Args, Debug, Clone, Serialize, Deserialize)]
pub struct Cmd {
    /// Session ID
    #[arg(long)]
    #[serde(rename = "session_id")]
    pub session: String,
    /// Tab ID
    #[arg(long)]
    #[serde(rename = "tab_id")]
    pub tab: String,
}

pub const COMMAND_NAME: &str = "browser.viewport";

pub fn context(cmd: &Cmd, result: &ActionResult) -> Option<ResponseContext> {
    if let ActionResult::Fatal { code, .. } = result
        && code == "SESSION_NOT_FOUND"
    {
        return None;
    }
    let tab_id = if let ActionResult::Fatal { code, .. } = result
        && code == "TAB_NOT_FOUND"
    {
        None
    } else {
        Some(cmd.tab.clone())
    };
    Some(ResponseContext {
        session_id: cmd.session.clone(),
        tab_id,
        window_id: None,
        url: None,
        title: None,
    })
}

/// Format viewport dimensions as `{width}x{height}` string.
pub fn format_viewport(width: u64, height: u64) -> String {
    format!("{width}x{height}")
}

pub async fn execute(_cmd: &Cmd, _registry: &SharedRegistry) -> ActionResult {
    ActionResult::fatal("NOT_IMPLEMENTED", "browser.viewport not yet implemented")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_viewport_standard() {
        assert_eq!(format_viewport(1440, 900), "1440x900");
    }

    #[test]
    fn test_format_viewport_hd() {
        assert_eq!(format_viewport(1920, 1080), "1920x1080");
    }

    #[test]
    fn test_format_viewport_small() {
        assert_eq!(format_viewport(375, 667), "375x667");
    }

    #[test]
    fn test_format_viewport_square() {
        assert_eq!(format_viewport(800, 800), "800x800");
    }

    #[test]
    fn test_format_viewport_zero_height() {
        assert_eq!(format_viewport(1280, 0), "1280x0");
    }
}
