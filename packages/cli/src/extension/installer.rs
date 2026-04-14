use std::path::{Path, PathBuf};

use serde_json::json;

use crate::action_result::ActionResult;
use crate::config;

pub const COMMAND_NAME_PATH: &str = "extension path";
pub const COMMAND_NAME_INSTALL: &str = "extension install";
pub const COMMAND_NAME_UNINSTALL: &str = "extension uninstall";

fn extension_dir() -> PathBuf {
    config::actionbook_home().join("extension")
}

fn read_version(dir: &Path) -> Option<String> {
    let bytes = std::fs::read(dir.join("manifest.json")).ok()?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    v["version"].as_str().map(String::from)
}

pub fn execute_path() -> ActionResult {
    let dir = extension_dir();
    let installed = dir.join("manifest.json").exists();
    let version = if installed { read_version(&dir) } else { None };
    ActionResult::ok(json!({
        "path": dir.to_string_lossy(),
        "installed": installed,
        "version": version,
    }))
}

pub fn execute_install(force: bool) -> ActionResult {
    let dir = extension_dir();

    if dir.exists() && !force {
        return ActionResult::fatal(
            "ALREADY_INSTALLED",
            format!(
                "extension already installed at '{}'; use --force to overwrite",
                dir.display()
            ),
        );
    }

    // Test seam: copy from local source directory
    if let Ok(src) = std::env::var("ACTIONBOOK_EXTENSION_TEST_SOURCE_DIR") {
        return copy_from_dir(Path::new(&src), &dir);
    }

    ActionResult::fatal(
        "NOT_IMPLEMENTED",
        "GitHub Releases download is not yet implemented; use ACTIONBOOK_EXTENSION_TEST_SOURCE_DIR for local install",
    )
}

fn copy_from_dir(src: &Path, dst: &Path) -> ActionResult {
    if let Err(e) = std::fs::remove_dir_all(dst)
        && e.kind() != std::io::ErrorKind::NotFound
    {
        return ActionResult::fatal(
            "IO_ERROR",
            format!("failed to remove existing install: {e}"),
        );
    }
    if let Err(e) = std::fs::create_dir_all(dst) {
        return ActionResult::fatal(
            "IO_ERROR",
            format!("failed to create install directory: {e}"),
        );
    }
    if let Err(e) = copy_dir_all(src, dst) {
        return ActionResult::fatal("IO_ERROR", format!("failed to copy extension files: {e}"));
    }
    let version = read_version(dst).unwrap_or_default();
    ActionResult::ok(json!({
        "path": dst.to_string_lossy(),
        "version": version,
    }))
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let dest = dst.join(entry.file_name());
        if file_type.is_dir() {
            std::fs::create_dir_all(&dest)?;
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

pub fn execute_uninstall() -> ActionResult {
    let dir = extension_dir();
    if !dir.exists() {
        return ActionResult::fatal("NOT_INSTALLED", "extension is not installed");
    }
    if let Err(e) = std::fs::remove_dir_all(&dir) {
        return ActionResult::fatal("IO_ERROR", format!("failed to remove extension: {e}"));
    }
    ActionResult::ok(json!({ "uninstalled": true }))
}
