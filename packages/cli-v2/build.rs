fn main() {
    let hash = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    let pkg_version = std::env::var("CARGO_PKG_VERSION").unwrap_or_default();
    let build_version = if hash.is_empty() {
        pkg_version
    } else {
        format!("{pkg_version}-{hash}")
    };

    println!("cargo:rustc-env=BUILD_VERSION={build_version}");
    println!("cargo:rerun-if-changed=.git/HEAD");
}
