mod discovery;
mod launcher;
mod session;

#[allow(unused_imports)]
pub use discovery::{discover_all_browsers, BrowserInfo, BrowserType};
pub use session::{SessionManager, SessionStatus};
