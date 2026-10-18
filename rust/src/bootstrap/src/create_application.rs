//! The composition root: the one place that knows every context, every route and the
//! transport. It builds the bus (the in-memory one, tracked), the stores and the unit of work
//! over them, the modules from each context's wiring, the routes under the API prefix, and the
//! two layers that give each request its identity (Security's authentication) and its
//! `ExecutionContext`. Then it starts the modules, seeds the administrator through the same
//! handler as any command, and only then listens.

use std::net::SocketAddr;
use std::sync::Arc;

use architecture_application::{Application, Auth, ExecutionContext, ExecutionContextOptions, Logger, UnitOfWork};
use architecture_domain::Id;
use architecture_infrastructure::data_sources::Snapshottable;
use architecture_infrastructure::{InMemoryEventBus, InMemoryUnitOfWork};
use axum::Router;
use axum::extract::{Request, State};
use axum::http::{HeaderName, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Json, Response};
use notes_infrastructure::directories::SecurityAccountDirectory;
use notes_presentation::note_routes;
use notes_wiring::{local_notes_module, note_store};
use security_presentation::{auth_routes, authenticate};
use security_wiring::{account_store, local_security_module};
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tracker_presentation::operation_routes;
use tracker_wiring::{local_tracker_module, operation_records, operation_store, tracked_event_bus};

use crate::settings::Settings;

const TRACE_HEADER: HeaderName = HeaderName::from_static("x-trace-id");

/// What every request's context is built from: the application's bus and logger, and the
/// stores a request's unit of work guards.
struct PerRequest {
    application: Application,
    logger: Arc<dyn Logger>,
    stores: Vec<Arc<dyn Snapshottable>>,
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
    // The stores, listed once: the unit of work of a request snapshots them all.
    let notes = note_store();
    let accounts = account_store();
    let operations = operation_store();
    let stores: Vec<Arc<dyn Snapshottable>> =
        vec![Arc::new(notes.clone()), Arc::new(accounts.clone()), Arc::new(operations.clone())];

    // The application's bus: the in-memory bus, decorated so that every operation is recorded.
    let records = operation_records(&operations);
    let event_bus = tracked_event_bus(Arc::new(InMemoryEventBus::new()), records.clone());

    // The modules, from each context's wiring. Notes asks Security's read model through its own
    // port: the adapter is built here, where the two contexts meet.
    let security = local_security_module(&accounts, &settings.security);
    let tracker = Arc::new(local_tracker_module(records));
    let notes = Arc::new(local_notes_module(&notes, SecurityAccountDirectory::new(security.account_queries.clone())));

    let application = Application::new(event_bus.clone())
        .register_module(tracker.clone())
        .register_module(notes.clone())
        .register_module(security.module.clone());
    application.start_modules().await;

    // The routes, under the API prefix, each context's under its own.
    let api = Router::new()
        .nest("/notes", note_routes(notes))
        .nest("/tracker/operations", operation_routes(tracker))
        .merge(auth_routes(security.module.clone()));
    let per_request = Arc::new(PerRequest { application, logger: logger.clone(), stores });
    let router = Router::new()
        .nest(&format!("/{}", settings.api_prefix), api)
        .fallback(not_found)
        // Layers run from the last added to the first: the caller is identified, then the context is built.
        .layer(middleware::from_fn_with_state(per_request, with_execution_context))
        .layer(middleware::from_fn_with_state(security.authentication.clone(), authenticate));

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
    let unit_of_work: Arc<dyn UnitOfWork> = Arc::new(InMemoryUnitOfWork::new(shared.stores.clone()));

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

#[derive(Serialize)]
struct Message {
    message: &'static str,
}

async fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(Message { message: "Not found" })).into_response()
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
            axum::serve(listener, self.router)
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
