//! The Notes routes, end to end: what a client sees. One application for the whole suite,
//! shared by its cases in order: each starts from what the earlier ones left (the admin's notes
//! accumulate). Write a case relative to that state, or with a fresh account; never assume an
//! empty store.

mod support;

use serde_json::{Value, json};
use support::start_test_application;

#[tokio::test]
async fn notes_as_a_client_sees_them() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let admin = app.admin().await;

    // GET /notes: nothing yet
    let list = admin.get(format!("{api}/notes")).send().await.expect("answers");
    assert_eq!(list.status(), 200);
    assert_eq!(list.json::<Value>().await.expect("JSON"), json!([]));

    // POST /notes: accepted, then listed, then read in full
    let created = admin
        .post(format!("{api}/notes"))
        .json(&json!({ "title": "title", "content": "content" }))
        .send()
        .await
        .expect("answers");
    assert_eq!(created.status(), 202);
    let operation = app.accepted(&admin, created).await;
    assert_eq!(operation["status"], "SUCCESS");
    let note_id = operation["result"].as_str().expect("the note's id").to_string();

    let mine: Value = admin.get(format!("{api}/notes")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(mine, json!([{ "id": note_id, "title": "title", "status": "ACTIVE", "pinned": false }]));

    let note = admin.get(format!("{api}/notes/{note_id}")).send().await.expect("answers");
    assert_eq!(note.status(), 200);
    let note: Value = note.json().await.expect("JSON");
    assert_eq!(note["title"], "title");
    assert_eq!(note["content"], "content");
    assert_eq!(note["status"], "ACTIVE");
    assert_eq!(note["pinned"], false);
    assert_eq!(note["sharedWith"], json!([]));
    assert!(note["ownerId"].is_string());

    // PUT /notes/:id replaces its content
    let edited = admin
        .put(format!("{api}/notes/{note_id}"))
        .json(&json!({ "title": "edited", "content": "new content" }))
        .send()
        .await
        .expect("answers");
    assert_eq!(app.accepted(&admin, edited).await["status"], "SUCCESS");
    let note: Value =
        admin.get(format!("{api}/notes/{note_id}")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(note["title"], "edited");

    // POST /notes/:id/archive
    let archived = admin.post(format!("{api}/notes/{note_id}/archive")).send().await.expect("answers");
    assert_eq!(archived.status(), 202);
    app.accepted(&admin, archived).await;
    let note: Value =
        admin.get(format!("{api}/notes/{note_id}")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(note["status"], "ARCHIVED");

    // GET /notes/:id: unknown
    let unknown = admin.get(format!("{api}/notes/does-not-exist")).send().await.expect("answers");
    assert_eq!(unknown.status(), 404);

    // Anonymous: refused
    let refused = app.anonymous().get(format!("{api}/notes")).send().await.expect("answers");
    assert_eq!(refused.status(), 403);

    app.stop().await;
}

#[tokio::test]
async fn a_suggestion_enters_the_domain_as_a_value_the_note_may_refuse() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let admin = app.admin().await;
    let create = |title: &str, content: &str| {
        admin.post(format!("{api}/notes")).json(&json!({ "title": title, "content": content })).send()
    };

    // Applied, with its provenance on the operation (ADR 7)
    let created = create("Untitled", "Groceries for Saturday\nmilk, eggs").await.expect("answers");
    let note_id = app.accepted(&admin, created).await["result"].as_str().expect("id").to_string();
    let accepted = admin.post(format!("{api}/notes/{note_id}/suggest-title")).send().await.expect("answers");
    assert_eq!(accepted.status(), 202);
    let operation = app.accepted(&admin, accepted).await;
    assert_eq!(operation["status"], "SUCCESS");
    assert_eq!(operation["result"]["title"], "Groceries for Saturday");
    assert_eq!(operation["result"]["provenance"]["source"], "heuristic");
    assert_eq!(operation["result"]["provenance"]["version"], "first-line/1");
    assert!(operation["result"]["provenance"]["at"].is_string());
    let note: Value =
        admin.get(format!("{api}/notes/{note_id}")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(note["title"], "Groceries for Saturday");

    // Refused by the note's rules: nothing changes
    let too_long = "x".repeat(120);
    let created = create("Long first line", &format!("{too_long}\nsecond line")).await.expect("answers");
    let note_id = app.accepted(&admin, created).await["result"].as_str().expect("id").to_string();
    let accepted = admin.post(format!("{api}/notes/{note_id}/suggest-title")).send().await.expect("answers");
    let operation = app.accepted(&admin, accepted).await;
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["error"]["type"], "NoteTitleTooLong");
    let note: Value =
        admin.get(format!("{api}/notes/{note_id}")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(note["title"], "Long first line");

    app.stop().await;
}

#[tokio::test]
async fn pinning_a_note_puts_it_first_in_my_notes_until_it_is_unpinned_and_is_refused_on_an_archived_one() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let admin = app.admin().await;
    let create =
        |title: &str| admin.post(format!("{api}/notes")).json(&json!({ "title": title, "content": "" })).send();
    let titles = |mine: Value| -> Vec<String> {
        mine.as_array().expect("a list").iter().map(|note| note["title"].as_str().expect("a title").into()).collect()
    };

    // Two notes, saved in this order
    let created = create("First").await.expect("answers");
    let first_id = app.accepted(&admin, created).await["result"].as_str().expect("id").to_string();
    let created = create("Second").await.expect("answers");
    let second_id = app.accepted(&admin, created).await["result"].as_str().expect("id").to_string();

    // POST /notes/:id/pin: the second comes first
    let pinned = admin.post(format!("{api}/notes/{second_id}/pin")).send().await.expect("answers");
    assert_eq!(pinned.status(), 202);
    assert_eq!(app.accepted(&admin, pinned).await["status"], "SUCCESS");
    let mine: Value = admin.get(format!("{api}/notes")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(titles(mine.clone()), ["Second", "First"]);
    assert_eq!(mine[0]["pinned"], true);
    assert_eq!(mine[1]["pinned"], false);
    let note: Value =
        admin.get(format!("{api}/notes/{second_id}")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(note["pinned"], true);

    // Pinning it again is refused by the note's rules
    let again = admin.post(format!("{api}/notes/{second_id}/pin")).send().await.expect("answers");
    let operation = app.accepted(&admin, again).await;
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["error"]["type"], "NoteAlreadyPinned");

    // POST /notes/:id/unpin: back to the order they were saved in
    let unpinned = admin.post(format!("{api}/notes/{second_id}/unpin")).send().await.expect("answers");
    assert_eq!(unpinned.status(), 202);
    assert_eq!(app.accepted(&admin, unpinned).await["status"], "SUCCESS");
    let mine: Value = admin.get(format!("{api}/notes")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(titles(mine), ["First", "Second"]);

    // An archived note cannot be pinned
    let archived = admin.post(format!("{api}/notes/{first_id}/archive")).send().await.expect("answers");
    app.accepted(&admin, archived).await;
    let refused = admin.post(format!("{api}/notes/{first_id}/pin")).send().await.expect("answers");
    assert_eq!(refused.status(), 202);
    let operation = app.accepted(&admin, refused).await;
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["error"]["type"], "NoteArchived");

    // Only the owner pins: bob, who is not, is refused
    app.sign_up_validated("bob@pins.fr", "bob").await;
    let bob = app.agent_as("bob@pins.fr", "bob").await;
    let refused = bob.post(format!("{api}/notes/{second_id}/pin")).send().await.expect("answers");
    let operation = app.accepted(&bob, refused).await;
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["error"]["type"], "NotNoteOwner");

    app.stop().await;
}

#[tokio::test]
async fn sharing_a_note_lets_the_recipient_read_it_and_is_refused_for_an_unknown_account() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let admin = app.admin().await;

    // A second, validated account: bob
    let bob_id = app.sign_up_validated("bob@notes.fr", "bob").await;

    // The admin writes a note and shares it with bob
    let created = admin
        .post(format!("{api}/notes"))
        .json(&json!({ "title": "Roadmap", "content": "Q4 plans" }))
        .send()
        .await
        .expect("answers");
    let note_id = app.accepted(&admin, created).await["result"].as_str().expect("id").to_string();
    let share = admin
        .post(format!("{api}/notes/{note_id}/share"))
        .json(&json!({ "recipientId": bob_id }))
        .send()
        .await
        .expect("answers");
    assert_eq!(share.status(), 202);
    assert_eq!(app.accepted(&admin, share).await["status"], "SUCCESS");

    // Bob sees it among the notes shared with him
    let bob = app.agent_as("bob@notes.fr", "bob").await;
    let shared: Value =
        bob.get(format!("{api}/notes/shared")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(shared.as_array().expect("a list").len(), 1);
    assert_eq!(shared[0]["id"], note_id);
    assert_eq!(shared[0]["title"], "Roadmap");
    assert_eq!(shared[0]["content"], "Q4 plans");
    assert!(shared[0]["ownerId"].is_string());
    let note = bob.get(format!("{api}/notes/{note_id}")).send().await.expect("answers");
    assert_eq!(note.status(), 200);

    // ... and was notified (next to the welcome notifications his account creation and validation produced)
    let inbox: Value = bob
        .get(format!("{api}/notifications/account/{bob_id}"))
        .send()
        .await
        .expect("answers")
        .json()
        .await
        .expect("JSON");
    let notice = inbox["notifications"]
        .as_array()
        .expect("a list")
        .iter()
        .find(|n| n["title"] == "A note was shared with you: Roadmap")
        .expect("notified");
    assert_eq!(notice["recipientId"], bob_id);
    assert_eq!(notice["metadata"]["noteId"], note_id);
    assert_eq!(notice["metadata"]["source"], "Notes.NoteShared");

    // Sharing with an unknown account is refused by the domain, through the port to Security
    let share = admin
        .post(format!("{api}/notes/{note_id}/share"))
        .json(&json!({ "recipientId": "00000000-0000-4000-8000-000000000000" }))
        .send()
        .await
        .expect("answers");
    assert_eq!(share.status(), 202);
    let operation = app.accepted(&admin, share).await;
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["error"]["type"], "RecipientNotFound");
    let note: Value =
        admin.get(format!("{api}/notes/{note_id}")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(note["sharedWith"], json!([bob_id]));

    app.stop().await;
}
