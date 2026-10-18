//! The Tracker routes, end to end: following an operation.

mod support;

use serde_json::{Value, json};
use support::start_test_application;

#[tokio::test]
async fn following_an_operation() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let admin = app.admin().await;

    // Sharing a note that does not exist is refused by the domain: a command that leaves no
    // trace in Notes, but a full one in Tracker.
    let accepted = admin
        .post(format!("{api}/notes/00000000-0000-4000-8000-000000000000/share"))
        .json(&json!({ "recipientId": "bob" }))
        .send()
        .await
        .expect("answers");
    assert_eq!(accepted.status(), 202);
    let trace_id = accepted.headers().get("x-trace-id").expect("a trace").to_str().expect("text").to_string();
    let operation_id = accepted.json::<Value>().await.expect("JSON")["operationId"].as_str().expect("id").to_string();

    // Recorded up to its outcome, in client words, without the execution context
    let operation = app.operation(&admin, &operation_id).await;
    assert_eq!(operation["id"], operation_id);
    assert_eq!(operation["name"], "ShareNote");
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["traceId"], trace_id);
    assert!(operation["subjectId"].is_string());
    assert_eq!(operation["error"], json!({ "type": "NoteNotFound", "message": "Note not found" }));
    assert!(operation["createdAt"].is_string());
    assert!(operation["finishedAt"].is_string());
    assert!(operation.get("context").is_none());

    // Listed for an administrator, by trace when asked
    let by_trace = admin
        .get(format!("{api}/tracker/operations"))
        .query(&[("traceId", trace_id.as_str())])
        .send()
        .await
        .expect("answers");
    assert_eq!(by_trace.status(), 200);
    let records: Vec<Value> = by_trace.json().await.expect("JSON");
    // The trace holds the command and everything it set off: here the notification telling the
    // caller how it went, whose own domain events are recorded too (never announced).
    assert!(records.iter().any(|r| r["name"] == "ShareNote" && r["status"] == "ERROR"));
    assert!(records.iter().any(|r| r["name"] == "NotificationFailed"));
    assert!(records.iter().all(|r| r["traceId"] == trace_id));

    // Not for a user, and not someone else's operation
    let bob_id = app.sign_up_validated("bob@tracker.fr", "bob").await;
    let bob = app.agent_as("bob@tracker.fr", "bob").await;
    assert_eq!(bob.get(format!("{api}/tracker/operations")).send().await.expect("answers").status(), 403);
    assert_eq!(
        bob.get(format!("{api}/tracker/operations/{operation_id}")).send().await.expect("answers").status(),
        404
    );
    let _ = bob_id;

    app.stop().await;
}
