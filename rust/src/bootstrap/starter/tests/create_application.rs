//! How an end-to-end suite boots the application: in this process, on a free port, with fresh
//! in-memory stores, spoken to over HTTP as a client would; one application per test, stopped
//! afterwards. A context's suite is a file of its own beside this one, `<things>_routes.rs`
//! (ARCH-E2E: it depends on this crate and on the libraries only).

use std::sync::Arc;

use architecture_application::Logger;
use bootstrap_starter::{Running, create_application};
use bootstrap_transport::TransportSettings;
use serde_json::Value;

/// A logger that says nothing: the tests read the HTTP answers, not the console.
struct Quiet;
impl Logger for Quiet {
    fn info(&self, _: &str, _: &str) {}
    fn warn(&self, _: &str, _: &str) {}
    fn error(&self, _: &str, _: &str, _: &str) {}
    fn debug(&self, _: &str, _: &str) {}
}

/// The application, serving on a free port, and the base URL of its API (`http://127.0.0.1:<port>/v1`).
async fn start() -> (Running, String) {
    let app = create_application(TransportSettings::for_tests(), Arc::new(Quiet)).await;
    let prefix = app.api_prefix().to_string();
    let running = app.start().await.expect("a free port");
    let api = format!("{}/{prefix}", running.address());
    (running, api)
}

#[tokio::test]
async fn serves_the_tracker_under_the_prefix_to_an_anonymous_caller_with_the_trace_of_the_request() {
    let (running, api) = start().await;
    let trace_id = "11111111-1111-4111-8111-111111111111";

    let response = reqwest::Client::new()
        .get(format!("{api}/tracker/operations/00000000-0000-4000-8000-000000000000"))
        .header("x-trace-id", trace_id)
        .send()
        .await
        .expect("answers");

    // An operation is followed by whoever started it; nobody started this one, and an anonymous
    // caller is told to sign in rather than whether it exists.
    assert_eq!(response.status(), 403);
    assert_eq!(response.headers()["x-trace-id"], trace_id);
    let body: Value = response.json().await.expect("JSON");
    assert!(body["message"].is_string());
    assert_eq!(body.as_object().map(|fields| fields.len()), Some(1), "a refusal is its message");

    running.stop().await;
}

#[tokio::test]
async fn lists_operations_for_an_administrator_only() {
    let (running, api) = start().await;

    let response = reqwest::get(format!("{api}/tracker/operations")).await.expect("answers");
    assert_eq!(response.status(), 403);

    running.stop().await;
}
