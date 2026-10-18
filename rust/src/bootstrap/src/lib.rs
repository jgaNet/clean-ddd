//! The composition root of the Rust application: the settings, and the one function that builds
//! the whole application — the bus, the stores, the modules, the routes, the transport — wired,
//! started, seeded, and ready to listen. Nothing here is business.
//!
//! The process entry point is `main.rs` (`cargo run -p bootstrap`); the end-to-end tests under
//! `tests/` boot the same application on a free port and speak HTTP to it.

pub mod create_application;
pub mod home;
pub mod settings;

pub use create_application::{App, Running, create_application};
pub use settings::Settings;
