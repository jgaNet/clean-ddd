//! The home of the API, in two formats: `{ name, version }` for an API client, the page shell
//! for the HTMX front end, which then loads the account. The one controller the composition
//! root owns, with its presenters beside it; and the health check.

use std::sync::Arc;

use architecture_presentation::{ByFormat, Presenter, format_of};
use axum::Router;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::{Html, IntoResponse, Json, Response};
use axum::routing::get;
use chrono::Utc;

pub struct HomeViewModel {
    pub name: String,
    pub version: String,
}

pub struct HomeJsonPresenter;
impl Presenter<HomeViewModel> for HomeJsonPresenter {
    fn present(&self, data: &HomeViewModel) -> Response {
        Json(serde_json::json!({ "name": data.name, "version": data.version })).into_response()
    }
}

pub struct HomeHtmxPresenter;
impl Presenter<HomeViewModel> for HomeHtmxPresenter {
    fn present(&self, data: &HomeViewModel) -> Response {
        Html(format!(
            r##"<main hx-trigger="load" hx-get="/v1/auth/me" hx-swap="innerHTML" hx-ext="response-targets,ws" hx-target="#app">
  <h1>{name}</h1>
  <p><b>Version:</b> {version}</p>
  <div id="app"></div>
</main>"##,
            name = data.name,
            version = data.version
        ))
        .into_response()
    }
}

const HOME: ByFormat<HomeViewModel> = ByFormat { json: &HomeJsonPresenter, htmx: Some(&HomeHtmxPresenter) };

/// `/` and `/health`, under the API prefix.
pub fn home_routes(home: Arc<HomeViewModel>) -> Router {
    Router::new().route("/", get(get_home)).route("/health", get(health)).with_state(home)
}

async fn get_home(State(home): State<Arc<HomeViewModel>>, headers: HeaderMap) -> Response {
    HOME.present(format_of(&headers), &home)
}

async fn health() -> Response {
    Json(serde_json::json!({ "status": "ok", "timestamp": Utc::now().to_rfc3339() })).into_response()
}
