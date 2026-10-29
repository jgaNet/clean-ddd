//! The composition root an application starts from (ADR 27): `clean-ddd create` gives it to a
//! new application in place of this repository's (`src/bootstrap`), which knows four contexts.
//! It knows one, the Tracker, because a command is answered `202 { operationId }` and the
//! Tracker is what a client follows that operation at, up to its outcome and its result
//! (`GET /v1/tracker/operations/{id}`). Nobody signs in here: every caller is anonymous until a
//! context that owns accounts gives the transport its authentication (`authenticated_by`).
//!
//! A new context is added here, as the Tracker is: its store in the list the unit of work
//! snapshots, its module after the Tracker's, its routes under its own prefix.

use std::sync::Arc;

use architecture_application::{Application, Auth, ExecutionContext, ExecutionContextOptions, Logger, relay_outbox};
use architecture_infrastructure::data_sources::Snapshottable;
use architecture_infrastructure::{InMemoryEventBus, InMemoryOutbox};
use bootstrap_transport::{AxumApplication, AxumApplicationOptions, TransportSettings};
use tracker_presentation::operation_routes;
use tracker_wiring::{local_tracker_module, operation_records, operation_store, tracked_event_bus};

pub use bootstrap_transport::Running;

/// Builds the application: the stores, the bus (the in-memory one, tracked), the modules, their
/// routes on the transport. The modules start before anything is served.
pub async fn create_application(settings: TransportSettings, logger: Arc<dyn Logger>) -> AxumApplication {
    // The stores, listed once: the unit of work of a request snapshots them all, the outbox's
    // among them, so that a fact is durable with the state it describes or gone with it (ADR 24).
    let operations = operation_store();
    let outbox = Arc::new(InMemoryOutbox::new());
    let stores: Vec<Arc<dyn Snapshottable>> = vec![Arc::new(operations.clone()), outbox.store()];

    // The application's bus: the in-memory bus, decorated so that every operation is recorded.
    let records = operation_records(&operations);
    let event_bus = tracked_event_bus(Arc::new(InMemoryEventBus::new()), records.clone());

    let tracker = Arc::new(local_tracker_module(records));
    let application = Application::new(event_bus.clone()).register_module(tracker.clone());
    application.start_modules().await;
    // What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
    // an in-memory outbox, and the line is where a store's outbox would be relayed.
    relay_outbox(
        outbox.as_ref(),
        &ExecutionContext::new(ExecutionContextOptions {
            trace_id: "startup".into(),
            auth: Auth::anonymous(),
            event_bus,
            unit_of_work: None,
            logger: Some(logger.clone()),
        }),
    )
    .await;

    AxumApplication::new(AxumApplicationOptions { application, stores, outbox, logger, settings })
        .nest("/tracker/operations", operation_routes(tracker))
}
