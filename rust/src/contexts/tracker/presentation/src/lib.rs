//! The REST routes of the Tracker context: read-only, the Tracker has no commands. Same shape as
//! the Notes routes: a router over the module the composition root passes, a function per route
//! that asks the module for the query's handler and answers synchronously, a `refuse()` that maps
//! a refusal to a status.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Module};
use architecture_domain::Exception;
use architecture_presentation::{refused, status_of};
use axum::Router;
use axum::extract::{Extension, Path, Query, State};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::get;
use serde::Deserialize;
use tracker_application::queries::get_operation::GetOperation;
use tracker_application::queries::get_operations::GetOperations;

/// `/tracker/operations`: the list (administrators) and one operation (its caller, or an administrator).
pub fn operation_routes(module: Arc<Module>) -> Router {
    Router::new().route("/", get(get_operations)).route("/{id}", get(get_operation)).with_state(module)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Filters {
    trace_id: Option<String>,
}

async fn get_operations(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
    Query(filters): Query<Filters>,
) -> Response {
    match module.query::<GetOperations>().handle(GetOperations { trace_id: filters.trace_id }, &context).await {
        Ok(records) => Json(records).into_response(),
        Err(error) => refuse(error),
    }
}

async fn get_operation(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
    Path(id): Path<String>,
) -> Response {
    match module.query::<GetOperation>().handle(GetOperation { id }, &context).await {
        Ok(record) => Json(record).into_response(),
        Err(error) => refuse(error),
    }
}

fn refuse(error: Exception) -> Response {
    refused(status_of(&error), &error)
}
