//! The Notifications routes, end to end: an inbox, as its recipient and others see it.

mod support;

use serde_json::{Value, json};
use support::start_test_application;

#[tokio::test]
async fn an_inbox() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let admin = app.admin().await;

    // Carol's sign-up and validation each produce one email notification for her.
    let carol_id = app.sign_up_validated("carol@notes.fr", "carol").await;
    let carol = app.agent_as("carol@notes.fr", "carol").await;

    // Listed for the recipient, newest first, without the attempts
    let inbox = carol.get(format!("{api}/notifications/account/{carol_id}")).send().await.expect("answers");
    assert_eq!(inbox.status(), 200);
    let inbox: Value = inbox.json().await.expect("JSON");
    assert_eq!(inbox["total"], 2);
    assert_eq!(inbox["unread"], 2);
    let delivered: Vec<(String, String)> = inbox["notifications"]
        .as_array()
        .expect("a list")
        .iter()
        .map(|n| (n["status"].as_str().unwrap().into(), n["deliveredVia"].as_str().unwrap().into()))
        .collect();
    assert_eq!(delivered, [("SENT".to_string(), "EMAIL".to_string()), ("SENT".to_string(), "EMAIL".to_string())]);
    assert!(inbox["notifications"][0].get("attempts").is_none());
    assert_eq!(inbox["notifications"][1]["metadata"]["source"], "Security.AccountCreated");

    // The recipient marks one read, once
    let first = inbox["notifications"][0]["id"].as_str().expect("id").to_string();
    let accepted = carol.patch(format!("{api}/notifications/{first}/read")).send().await.expect("answers");
    assert_eq!(accepted.status(), 202);
    assert_eq!(app.accepted(&carol, accepted).await["status"], "SUCCESS");

    // (her own command also produced one outcome notice, undelivered without a websocket: FAILED, not unread)
    let after: Value = carol
        .get(format!("{api}/notifications/account/{carol_id}"))
        .send()
        .await
        .expect("answers")
        .json()
        .await
        .expect("JSON");
    assert_eq!(after["unread"], 1);
    let read = after["notifications"].as_array().unwrap().iter().find(|n| n["id"] == first).expect("still there");
    assert_eq!(read["status"], "READ");
    assert!(read["readAt"].is_string());
    let failed =
        after["notifications"].as_array().unwrap().iter().find(|n| n["status"] == "FAILED").expect("the notice");
    assert_eq!(failed["title"], "Operation complete: MarkAsReadNotification");
    assert_eq!(failed["channels"], json!(["WEBSOCKET"]));

    let again = carol.patch(format!("{api}/notifications/{first}/read")).send().await.expect("answers");
    let operation = app.accepted(&carol, again).await;
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["error"]["type"], "NotificationAlreadyRead");

    // Private: an administrator may read any inbox, another user may not
    let as_admin = admin.get(format!("{api}/notifications/account/{carol_id}")).send().await.expect("answers");
    assert_eq!(as_admin.status(), 200);
    app.sign_up_validated("dave@notes.fr", "dave").await;
    let dave = app.agent_as("dave@notes.fr", "dave").await;
    let refused = dave.get(format!("{api}/notifications/account/{carol_id}")).send().await.expect("answers");
    assert_eq!(refused.status(), 403);

    // Only an administrator sends one by hand
    let by_hand = dave
        .post(format!("{api}/notifications"))
        .json(&json!({ "recipientId": carol_id, "title": "Hi", "content": "there", "channels": ["EMAIL"] }))
        .send()
        .await
        .expect("answers");
    assert_eq!(app.accepted(&dave, by_hand).await["error"]["type"], "NotAllowed");
    let by_admin = admin
        .post(format!("{api}/notifications"))
        .json(&json!({ "recipientId": carol_id, "title": "Hi", "content": "there", "channels": ["EMAIL"], "metadata": { "email": "carol@notes.fr" } }))
        .send()
        .await
        .expect("answers");
    assert_eq!(app.accepted(&admin, by_admin).await["status"], "SUCCESS");
    let unknown_channel = admin
        .post(format!("{api}/notifications"))
        .json(&json!({ "recipientId": carol_id, "title": "Hi", "content": "there", "channels": ["PIGEON"] }))
        .send()
        .await
        .expect("answers");
    assert_eq!(unknown_channel.status(), 422);

    app.stop().await;
}
