//! The composition root of the Rust application: the settings, and the one function that builds
//! the whole application — the bus, the stores, the modules, the routes — on the transport
//! (`bootstrap-transport`, which knows no context), wired, started, seeded, and ready to listen.
//! Nothing here is business.
//!
//! The process entry point is `main.rs` (`cargo run -p bootstrap`); the end-to-end tests under
//! `tests/` boot the same application on a free port and speak HTTP to it. The composition a
//! created application starts from, the Tracker alone, is beside it: `starter/` (ADR 27).

pub mod create_application;
pub mod home;
pub mod settings;

pub use bootstrap_transport::{AxumApplication, Running};
pub use create_application::create_application;
pub use settings::Settings;
