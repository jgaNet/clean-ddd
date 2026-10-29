//! The process entry point: build the application and serve it, on the port the environment
//! says (`PORT`, 10000 by default), under its API prefix (`API_PREFIX`, `v1`), to the origins it
//! lists (`WEB_ORIGINS`). Everything else is in `lib.rs`, so that the tests can build the same
//! application without listening here.

use std::process::ExitCode;
use std::sync::Arc;

use architecture_infrastructure::ConsoleLogger;
use bootstrap_starter::create_application;
use bootstrap_transport::TransportSettings;

#[tokio::main]
async fn main() -> ExitCode {
    let logger = Arc::new(ConsoleLogger::new(false));
    create_application(TransportSettings::from_env(), logger).await.serve().await
}
