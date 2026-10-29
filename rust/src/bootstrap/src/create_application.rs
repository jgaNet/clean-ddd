//! The composition root: the one place that knows every context, every route and the
//! transport. It builds the bus (the in-memory one, tracked), the stores and the unit of work
//! over them, the modules from each context's wiring, the routes under the API prefix, and the
//! two layers that give each request its identity (Security's authentication) and its
//! `ExecutionContext`. Then it starts the modules, seeds the administrator through the same
//! handler as any command, and only then listens. The websocket is served beside the API. The
//! front end is not: it is a client like any other (`web/`, served by any static server), so the
//! API answers it as it answers an API client, with CORS for the origins the settings allow.

use std::net::SocketAddr;
use std::sync::Arc;

use architecture_application::{
    Application, Auth, ExecutionContext, ExecutionContextOptions, Logger, Outbox, UnitOfWork, relay_outbox,
};
use architecture_domain::Id;
use architecture_infrastructure::data_sources::Snapshottable;
use architecture_infrastructure::{InMemoryEventBus, InMemoryOutbox, InMemoryUnitOfWork};
use axum::Router;
use axum::ServiceExt;
use axum::extract::{Request, State};
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::{self, Next};
use axum::response::Response;
use notes_infrastructure::directories::SecurityAccountDirectory;
use notes_presentation::note_routes;
use notes_wiring::{local_notes_module, note_store};
use notifications_presentation::notification_routes;
use notifications_wiring::{local_notifications_module, notification_store};
use security_presentation::{auth_routes, authenticate};
use security_wiring::{account_store, local_security_module};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tower::Layer;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::normalize_path::NormalizePathLayer;
use tracker_presentation::operation_routes;
use tracker_wiring::{local_tracker_module, operation_records, operation_store, tracked_event_bus};

use crate::home::{HomeViewModel, home_routes};
use crate::settings::Settings;

const TRACE_HEADER: HeaderName = HeaderName::from_static("x-trace-id");

/// CORS for the origins the settings allow; a layer that allows nothing when there are none.
fn cors(origins: &[String]) -> CorsLayer {
    if origins.is_empty() {
        return CorsLayer::new();
    }
    let allowed: Vec<HeaderValue> = origins.iter().filter_map(|origin| origin.parse().ok()).collect();
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed))
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any)
        .expose_headers([TRACE_HEADER])
}

/// What every request's context is built from: the application's bus and logger, the stores a
/// request's unit of work guards, and the process's outbox it writes its facts to (ADR 24).
struct PerRequest {
    application: Application,
    logger: Arc<dyn Logger>,
    stores: Vec<Arc<dyn Snapshottable>>,
    outbox: Arc<dyn Outbox>,
}

/// The application: wired, its modules listening on the bus, seeded; not yet serving.
pub struct App {
    router: Router,
    logger: Arc<dyn Logger>,
    port: u16,
}

/// Builds the whole application. The modules start before the seed so that the seed's events
/// reach their handlers.
pub async fn create_application(settings: Settings, logger: Arc<dyn Logger>) -> App {
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

    // The routes, under the API prefix, each context's under its own; the websocket at the root.
    let home = Arc::new(HomeViewModel { name: settings.name.clone(), version: settings.version.clone() });
    let api = Router::new()
        .merge(home_routes(home))
        .nest("/notes", note_routes(notes))
        .nest("/tracker/operations", operation_routes(tracker))
        .nest("/notifications", notification_routes(notifications.module.clone()))
        .merge(auth_routes(security.module.clone()));
    let per_request = Arc::new(PerRequest { application, logger: logger.clone(), stores, outbox });
    let router = Router::new()
        .nest(&format!("/{}", settings.api_prefix), api)
        .merge(notifications.websocket.clone().routes())
        // Layers run from the last added to the first: the caller is identified, then the context is built.
        .layer(middleware::from_fn_with_state(per_request, with_execution_context))
        .layer(middleware::from_fn_with_state(security.authentication.clone(), authenticate))
        // A front end served from another origin calls the API with a bearer token, never a cookie.
        .layer(cors(&settings.web_origins));

    // The administrator account the settings describe, created before the first request.
    if let Some(admin) = &settings.admin_account
        && let Err(refusal) = security.register_admin(&admin.identifier, &admin.password, event_bus).await
    {
        logger.error("bootstrap", "The administrator could not be registered", refusal.message());
    }

    App { router, logger, port: settings.port }
}

/// One execution context per request: its trace, its caller, and its own unit of work. A unit
/// of work is a request-scoped thing; sharing one instance across requests would make
/// concurrent commands join each other's transaction.
async fn with_execution_context(State(shared): State<Arc<PerRequest>>, mut request: Request, next: Next) -> Response {
    let trace_id = request
        .headers()
        .get(&TRACE_HEADER)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| Id::generate().value().to_string());
    let auth = request.extensions().get::<Auth>().cloned().unwrap_or_default();
    let unit_of_work: Arc<dyn UnitOfWork> =
        Arc::new(InMemoryUnitOfWork::new(shared.stores.clone(), shared.outbox.clone()));

    request.extensions_mut().insert(ExecutionContext::new(ExecutionContextOptions {
        trace_id: trace_id.clone(),
        auth,
        event_bus: shared.application.event_bus().clone(),
        unit_of_work: Some(unit_of_work),
        logger: Some(shared.logger.clone()),
    }));

    let mut response = next.run(request).await;
    if let Ok(value) = HeaderValue::from_str(&trace_id) {
        response.headers_mut().insert(TRACE_HEADER, value);
    }
    response
}

impl App {
    /// Listens on the port of the settings; port 0 asks the OS for a free one (tests).
    pub async fn start(self) -> std::io::Result<Running> {
        let port = self.port;
        self.start_on(port).await
    }

    pub async fn start_on(self, port: u16) -> std::io::Result<Running> {
        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], port))).await?;
        let address = listener.local_addr()?;
        let (stop, stopped) = oneshot::channel::<()>();
        let serving = tokio::spawn(async move {
            // `/v1/` is `/v1`: a trailing slash names the same route, as it does for every language.
            let router = NormalizePathLayer::trim_trailing_slash().layer(self.router);
            axum::serve(listener, ServiceExt::<Request>::into_make_service(router))
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await
        });
        self.logger.info("bootstrap", &format!("Listening on http://{address}"));
        Ok(Running { address, stop, serving })
    }
}

/// The application, serving. Dropping it without `stop()` leaves it serving until the runtime ends.
pub struct Running {
    address: SocketAddr,
    stop: oneshot::Sender<()>,
    serving: JoinHandle<std::io::Result<()>>,
}

impl Running {
    /// `http://127.0.0.1:<port>`
    pub fn address(&self) -> String {
        format!("http://{}", self.address)
    }

    /// Serves until the transport ends (a bind error, a shutdown).
    pub async fn wait(self) -> std::io::Result<()> {
        self.serving.await.unwrap_or_else(|join| Err(std::io::Error::other(join)))
    }

    /// Stops serving: in-flight requests finish, new connections are refused.
    pub async fn stop(self) {
        let _ = self.stop.send(());
        let _ = self.serving.await;
    }
}
