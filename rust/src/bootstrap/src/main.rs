//! The process entry point: build the application and serve it. Everything else is in
//! `create_application.rs`, so that the tests can build the same application without listening here.

use std::process::ExitCode;
use std::sync::Arc;

use architecture_application::Logger;
use architecture_infrastructure::ConsoleLogger;
use bootstrap::{Settings, create_application};

#[tokio::main]
async fn main() -> ExitCode {
    let settings = Settings::from_env();
    let logger: Arc<dyn Logger> = Arc::new(ConsoleLogger::new(settings.debug));

    let app = create_application(settings, logger.clone()).await;
    let outcome = match app.start().await {
        Ok(running) => running.wait().await,
        Err(error) => Err(error),
    };
    match outcome {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            logger.error("bootstrap", "The application could not start", &error.to_string());
            ExitCode::FAILURE
        }
    }
}
