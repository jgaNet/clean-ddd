//! The composition root: the one place that knows every context and every route. It builds
//! the bus (the in-memory one, tracked), the stores and the outbox, the modules from each
//! context's wiring, and hands them to the transport ([`AxumApplication`], which knows no
//! context) with each context's routes under its own prefix and Security's authentication as
//! the layer that says who is calling. Then it seeds the administrator through the same handler
//! as any command; `start()` listens. The websocket is served beside the API. The front end is
//! not: it is a client like any other (`web/`, served by any static server), so the API answers
//! it as it answers an API client, with CORS for the origins the settings allow.

use std::sync::Arc;

use architecture_application::{Application, Auth, ExecutionContext, ExecutionContextOptions, Logger, relay_outbox};
use architecture_infrastructure::data_sources::Snapshottable;
use architecture_infrastructure::{InMemoryEventBus, InMemoryOutbox};
use axum::middleware;
use bootstrap_transport::{AxumApplication, AxumApplicationOptions};
use notes_infrastructure::directories::SecurityAccountDirectory;
use notes_presentation::note_routes;
use notes_wiring::{local_notes_module, note_store};
use notifications_presentation::notification_routes;
use notifications_wiring::{local_notifications_module, notification_store};
use security_presentation::{auth_routes, authenticate};
use security_wiring::{account_store, local_security_module};
use tracker_presentation::operation_routes;
use tracker_wiring::{local_tracker_module, operation_records, operation_store, tracked_event_bus};

use crate::home::{HomeViewModel, home_routes};
use crate::settings::Settings;

/// Builds the whole application. The modules start before the seed so that the seed's events
/// reach their handlers.
pub async fn create_application(settings: Settings, logger: Arc<dyn Logger>) -> AxumApplication {
    // The stores, listed once: the unit of work of a request snapshots them all, the outbox's
    // among them, so that a fact is durable with the state it describes or gone with it (ADR 24).
    let notes = note_store();
    let accounts = account_store();
    let operations = operation_store();
    let notifications = notification_store();
    let outbox = Arc::new(InMemoryOutbox::new());
    let stores: Vec<Arc<dyn Snapshottable>> = vec![
        Arc::new(notes.clone()),
        Arc::new(accounts.clone()),
        Arc::new(operations.clone()),
        Arc::new(notifications.clone()),
        outbox.store(),
    ];

    // The application's bus: the in-memory bus, decorated so that every operation is recorded.
    let records = operation_records(&operations);
    let event_bus = tracked_event_bus(Arc::new(InMemoryEventBus::new()), records.clone());

    // The modules, from each context's wiring. Notes asks Security's read model through its own
    // port: the adapter is built here, where the two contexts meet.
    let security = local_security_module(&accounts, &settings.security);
    let tracker = Arc::new(local_tracker_module(records));
    let notes = Arc::new(local_notes_module(&notes, SecurityAccountDirectory::new(security.account_queries.clone())));
    let notifications = local_notifications_module(&notifications, &settings.notifications, logger.clone());

    let application = Application::new(event_bus.clone())
        .register_module(tracker.clone())
        .register_module(notes.clone())
        .register_module(security.module.clone())
        .register_module(notifications.module.clone());
    application.start_modules().await;
    // What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
    // an in-memory outbox, and the line is where a store's outbox would be relayed.
    relay_outbox(
        outbox.as_ref(),
        &ExecutionContext::new(ExecutionContextOptions {
            trace_id: "startup".into(),
            auth: Auth::anonymous(),
            event_bus: event_bus.clone(),
            unit_of_work: None,
            logger: Some(logger.clone()),
        }),
    )
    .await;

    // The routes, each context's under its own prefix, which the transport serves under the
    // API's; the websocket beside the API; Security says who is calling.
    let home = Arc::new(HomeViewModel { name: settings.name.clone(), version: settings.version.clone() });
    let app = AxumApplication::new(AxumApplicationOptions {
        application,
        stores,
        outbox,
        logger: logger.clone(),
        settings: settings.transport,
    })
    .merge(home_routes(home))
    .nest("/notes", note_routes(notes))
    .nest("/tracker/operations", operation_routes(tracker))
    .nest("/notifications", notification_routes(notifications.module.clone()))
    .merge(auth_routes(security.module.clone()))
    .outside_api(notifications.websocket.clone().routes())
    .authenticated_by(middleware::from_fn_with_state(security.authentication.clone(), authenticate));

    // The administrator account the settings describe, created before the first request.
    if let Some(admin) = &settings.admin_account
        && let Err(refusal) = security.register_admin(&admin.identifier, &admin.password, event_bus).await
    {
        logger.error("bootstrap", "The administrator could not be registered", refusal.message());
    }

    app
}
