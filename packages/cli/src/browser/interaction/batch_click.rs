use clap::Args;
use serde::{Deserialize, Serialize};

use crate::action_result::ActionResult;
use crate::daemon::registry::SharedRegistry;
use crate::output::ResponseContext;

use super::click;

/// Click multiple elements in sequence
#[derive(Args, Debug, Clone, Serialize, Deserialize)]
#[command(after_help = "\
Examples:
  actionbook browser batch-click @e5 @e6 @e7 @e8 --session s1 --tab t1
  actionbook browser batch-click \"#card-1\" \"#card-2\" \"#card-3\" --session s1 --tab t1

Clicks each element sequentially. Stops on first failure.
Use this for expanding cards, toggling checkboxes, or any bulk DOM action.
Refs come from snapshot output (e.g. [ref=e5]).")]
pub struct Cmd {
    /// Snapshot refs or CSS selectors to click (2 or more)
    #[arg(num_args(2..))]
    pub selectors: Vec<String>,
    /// Session ID
    #[arg(long)]
    #[serde(rename = "session_id")]
    pub session: String,
    /// Tab ID
    #[arg(long)]
    #[serde(rename = "tab_id")]
    pub tab: String,
}

pub const COMMAND_NAME: &str = "browser batch-click";

pub fn context(cmd: &Cmd, result: &ActionResult) -> Option<ResponseContext> {
    click::context(&to_click_cmd(cmd), result)
}

pub async fn execute(cmd: &Cmd, registry: &SharedRegistry) -> ActionResult {
    click::execute(&to_click_cmd(cmd), registry).await
}

fn to_click_cmd(cmd: &Cmd) -> click::Cmd {
    click::Cmd {
        selectors: cmd.selectors.clone(),
        session: cmd.session.clone(),
        tab: cmd.tab.clone(),
        new_tab: false,
        button: "left".to_string(),
        count: 1,
    }
}
