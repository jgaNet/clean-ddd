//! The server a composition root is built on. Without an authentication, every caller is
//! anonymous: who may sign in is a context's business, and the context that owns accounts gives
//! the transport the layer that says who is calling (`authenticated_by`).

use std::convert::Infallible;
use std::env;
use std::net::SocketAddr;
use std::process::ExitCode;
use std::sync::Arc;

use architecture_application::{
    Application, Auth, ExecutionContext, ExecutionContextOptions, Logger, Outbox, UnitOfWork,
};
use architecture_domain::Id;
use architecture_infrastructure::InMemoryUnitOfWork;
use architecture_infrastructure::data_sources::Snapshottable;
use axum::extract::{Request, State};
use axum::http::{HeaderName, HeaderValue};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::Route;
use axum::{Router, ServiceExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tower::{Layer, Service};
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::normalize_path::NormalizePathLayer;

const TRACE_HEADER: HeaderName = HeaderName::from_static("x-trace-id");

/// Where and to whom the API is served — what the environment decides, and nothing of any context.
pub struct TransportSettings {
    /// Every route is served under it: `v1` serves `/notes` at `/v1/notes`.
    pub api_prefix: String,
    /// The port `start()` listens on; 0 asks the OS for a free one.
    pub port: u16,
    /// The origins a front end may call the API from (CORS); none: same-origin clients only.
    pub web_origins: Vec<String>,
}

impl TransportSettings {
    /// `PORT` (10000), `API_PREFIX` (`v1`) and `WEB_ORIGINS` (comma-separated; none by default).
    pub fn from_env() -> Self {
        let var = |name: &str| env::var(name).ok().filter(|value| !value.is_empty());
        Self {
            api_prefix: var("API_PREFIX").unwrap_or_else(|| "v1".into()),
            port: var("PORT").and_then(|port| port.parse().ok()).unwrap_or(10000),
            web_origins: var("WEB_ORIGINS")
                .map(|origins| origins.split(',').filter(|o| !o.is_empty()).map(String::from).collect())
                .unwrap_or_default(),
        }
    }

    /// A test application's: a free port, `v1`, no other origin.
    pub fn for_tests() -> Self {
        Self { api_prefix: "v1".into(), port: 0, web_origins: vec![] }
    }
}

/// What a composition root hands the transport: the application it serves, and what each
/// request's context is built from.
pub struct AxumApplicationOptions {
    /// The bus and the modules, started: every request's context publishes on that bus.
    pub application: Application,
    /// The stores a request's unit of work guards, and the process's outbox it writes its facts
    /// to, so that a fact is durable with the state it describes or gone with it (ADR 24).
    pub stores: Vec<Arc<dyn Snapshottable>>,
    pub outbox: Arc<dyn Outbox>,
    pub logger: Arc<dyn Logger>,
    pub settings: TransportSettings,
}

/// What every request's context is built from.
struct PerRequest {
    application: Application,
    logger: Arc<dyn Logger>,
    stores: Vec<Arc<dyn Snapshottable>>,
    outbox: Arc<dyn Outbox>,
}

/// The layer that says who is calling, applied over every route once they are all mounted.
type Authentication = Box<dyn FnOnce(Router) -> Router + Send>;

/// The application, wired and not yet serving: the routes mounted on it, and how it listens.
pub struct AxumApplication {
    per_request: Arc<PerRequest>,
    settings: TransportSettings,
    api: Router,
    outside_api: Router,
    authentication: Option<Authentication>,
}

impl AxumApplication {
    pub fn new(options: AxumApplicationOptions) -> Self {
        let AxumApplicationOptions { application, stores, outbox, logger, settings } = options;
        Self {
            per_request: Arc::new(PerRequest { application, logger, stores, outbox }),
            settings,
            api: Router::new(),
            outside_api: Router::new(),
            authentication: None,
        }
    }

    /// A context's routes, under `/<api_prefix><prefix>`: `/notes` is served at `/v1/notes`.
    pub fn nest(mut self, prefix: &str, routes: Router) -> Self {
        self.api = self.api.nest(prefix, routes);
        self
    }

    /// Routes served at the API prefix itself, each at its own path (`/v1/auth/login`).
    pub fn merge(mut self, routes: Router) -> Self {
        self.api = self.api.merge(routes);
        self
    }

    /// Routes served beside the API, outside its prefix (a websocket at `/ws`).
    pub fn outside_api(mut self, routes: Router) -> Self {
        self.outside_api = self.outside_api.merge(routes);
        self
    }

    /// The layer that says who is calling, by inserting an [`Auth`] in the request's extensions
    /// before the execution context is built; the context that owns accounts provides it.
    /// Without one, every caller is anonymous.
    pub fn authenticated_by<L>(mut self, layer: L) -> Self
    where
        L: Layer<Route> + Clone + Send + Sync + 'static,
        L::Service: Service<Request> + Clone + Send + Sync + 'static,
        <L::Service as Service<Request>>::Response: IntoResponse + 'static,
        <L::Service as Service<Request>>::Error: Into<Infallible> + 'static,
        <L::Service as Service<Request>>::Future: Send + 'static,
    {
        self.authentication = Some(Box::new(move |router: Router| router.layer(layer)));
        self
    }

    pub fn api_prefix(&self) -> &str {
        &self.settings.api_prefix
    }

    /// The process's life: listens on the port of the settings and serves until the transport
    /// ends; a failure to listen or to serve is logged and is the process's failure.
    pub async fn serve(self) -> ExitCode {
        let logger = self.per_request.logger.clone();
        let outcome = match self.start().await {
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

    /// Listens on the port of the settings; port 0 asks the OS for a free one (tests).
    pub async fn start(self) -> std::io::Result<Running> {
        let port = self.settings.port;
        self.start_on(port).await
    }

    pub async fn start_on(self, port: u16) -> std::io::Result<Running> {
        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], port))).await?;
        let address = listener.local_addr()?;
        let logger = self.per_request.logger.clone();
        let router = self.router();
        let (stop, stopped) = oneshot::channel::<()>();
        let serving = tokio::spawn(async move {
            // `/v1/` is `/v1`: a trailing slash names the same route, as it does for every language.
            let router = NormalizePathLayer::trim_trailing_slash().layer(router);
            axum::serve(listener, ServiceExt::<Request>::into_make_service(router))
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await
        });
        logger.info("bootstrap", &format!("Listening on http://{address}"));
        Ok(Running { address, stop, serving })
    }

    /// The routes under the prefix and beside it, then the layers, which run from the last added
    /// to the first: the origin is checked, the caller is identified, then the context is built.
    fn router(self) -> Router {
        let mut router = Router::new()
            .nest(&format!("/{}", self.settings.api_prefix), self.api)
            .merge(self.outside_api)
            .layer(middleware::from_fn_with_state(self.per_request, with_execution_context));
        if let Some(authenticate) = self.authentication {
            router = authenticate(router);
        }
        // A front end served from another origin calls the API with a bearer token, never a cookie.
        router.layer(cors(&self.settings.web_origins))
    }
}

/// CORS for the origins given; a layer that allows nothing when there are none.
fn cors(origins: &[String]) -> CorsLayer {
    if origins.is_empty() {
        return CorsLayer::new();
    }
    let allowed: Vec<HeaderValue> = origins.iter().filter_map(|origin| origin.parse().ok()).collect();
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed))
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers([TRACE_HEADER])
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
    // Anonymous unless the authentication said otherwise; without one, anonymous throughout.
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
