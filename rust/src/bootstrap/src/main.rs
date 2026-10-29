//! The process entry point: build the application and serve it, on the port its settings read
//! (`PORT`). Everything else is in `create_application.rs`, so that the tests can build the same
//! application without listening here.

use std::process::ExitCode;
use std::sync::Arc;

use architecture_infrastructure::ConsoleLogger;
use bootstrap::{Settings, create_application};

#[tokio::main]
async fn main() -> ExitCode {
    let settings = Settings::from_env();
    let logger = Arc::new(ConsoleLogger::new(settings.debug));
    create_application(settings, logger).await.serve().await
}
