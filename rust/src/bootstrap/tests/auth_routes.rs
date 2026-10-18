//! The auth routes, end to end: login, sign-up, validation, and what a reference must not do.

mod support;

use serde_json::{Value, json};
use support::start_test_application;

#[tokio::test]
async fn login_answers_a_token_for_valid_credentials_and_401_otherwise() {
    let app = start_test_application().await;
    let api = app.api.clone();

    let accepted = app.login("admin@admin.fr", "admin").await;
    assert_eq!(accepted.status(), 200);
    assert!(accepted.headers().get("set-cookie").is_some_and(|cookie| cookie.to_str().unwrap().starts_with("token=")));
    let body: Value = accepted.json().await.expect("JSON");
    assert!(body["token"].is_string());

    let unknown = app.login("error@admin.fr", "admin").await;
    assert_eq!(unknown.status(), 401);
    let wrong = app.login("admin@admin.fr", "nope").await;
    assert_eq!(wrong.status(), 401);

    // A forged token is ignored: the caller is anonymous, and /auth/me says so
    let forged = "eyJhbGciOiJIUzI1NiJ9.eyJzdWJqZWN0SWQiOiJ4Iiwic3ViamVjdFR5cGUiOiJBRE1JTiJ9.bad";
    let me = app
        .anonymous()
        .get(format!("{api}/auth/me"))
        .header("authorization", format!("Bearer {forged}"))
        .send()
        .await
        .expect("answers");
    assert_eq!(me.status(), 401);

    // The genuine one is not
    let admin = app.admin().await;
    let me: Value = admin.get(format!("{api}/auth/me")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(me["email"], "admin@admin.fr");
    assert_eq!(me["role"], "ADMIN");
    assert_eq!(me["status"], "ACTIVE");

    app.stop().await;
}

#[tokio::test]
async fn sign_up_opens_a_pending_account_an_administrator_validates() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let admin = app.admin().await;
    let sign_up = |identifier: &str, password: &str| {
        app.anonymous()
            .post(format!("{api}/auth/signup"))
            .json(&json!({ "identifier": identifier, "password": password }))
            .send()
    };

    // An existing email is refused, through the operation
    let existing = sign_up("admin@admin.fr", "admin").await.expect("answers");
    assert_eq!(existing.status(), 202);
    let operation = app.accepted(&admin, existing).await;
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["error"]["type"], "AccountAlreadyExists");

    // A new one is pending until validated
    let signed_up = sign_up("user@user.fr", "user").await.expect("answers");
    let operation = app.accepted(&admin, signed_up).await;
    assert_eq!(operation["status"], "SUCCESS");
    let account_id = operation["result"].as_str().expect("an account id").to_string();

    let pending: Value = admin
        .get(format!("{api}/auth/accounts/{account_id}"))
        .send()
        .await
        .expect("answers")
        .json()
        .await
        .expect("JSON");
    assert_eq!(pending, json!({ "id": account_id, "email": "user@user.fr", "role": "USER", "status": "PENDING" }));
    assert_eq!(app.login("user@user.fr", "user").await.status(), 401);

    let validate = admin.get(format!("{api}/auth/accounts/{account_id}/validate")).send().await.expect("answers");
    assert_eq!(app.accepted(&admin, validate).await["status"], "SUCCESS");

    let active: Value = admin
        .get(format!("{api}/auth/accounts/{account_id}"))
        .send()
        .await
        .expect("answers")
        .json()
        .await
        .expect("JSON");
    assert_eq!(active["status"], "ACTIVE");
    let login = app.login("user@user.fr", "user").await;
    assert_eq!(login.status(), 200);

    // A user reads their own account, not another's
    let user = app.agent_as("user@user.fr", "user").await;
    let own = user.get(format!("{api}/auth/accounts/{account_id}")).send().await.expect("answers");
    assert_eq!(own.status(), 200);
    let me: Value = user.get(format!("{api}/auth/me")).send().await.expect("answers").json().await.expect("JSON");
    assert!(me["lastAuthenticatedAt"].is_string());
    let admin_id =
        admin.get(format!("{api}/auth/me")).send().await.expect("answers").json::<Value>().await.expect("JSON")["id"]
            .as_str()
            .expect("id")
            .to_string();
    let other = user.get(format!("{api}/auth/accounts/{admin_id}")).send().await.expect("answers");
    assert_eq!(other.status(), 403);

    app.stop().await;
}

#[tokio::test]
async fn what_a_reference_must_not_do() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let admin = app.admin().await;

    // Never store or serve the password of a sign-up
    let signed_up = app
        .anonymous()
        .post(format!("{api}/auth/signup"))
        .json(&json!({ "identifier": "frank@user.fr", "password": "S3cret-Plaintext" }))
        .send()
        .await
        .expect("answers");
    let operation = app.accepted(&admin, signed_up).await;
    assert!(operation.get("payload").is_none());
    assert!(!operation.to_string().contains("S3cret-Plaintext"));

    // Never let an anonymous caller validate an account
    let signed_up = app
        .anonymous()
        .post(format!("{api}/auth/signup"))
        .json(&json!({ "identifier": "grace@user.fr", "password": "grace" }))
        .send()
        .await
        .expect("answers");
    let account_id = app.accepted(&admin, signed_up).await["result"].as_str().expect("id").to_string();
    let attempt =
        app.anonymous().get(format!("{api}/auth/accounts/{account_id}/validate")).send().await.expect("answers");
    assert_eq!(attempt.status(), 202);
    let operation = app.accepted(&admin, attempt).await;
    assert_eq!(operation["status"], "ERROR");
    assert_eq!(operation["error"]["type"], "NotAllowed");
    let account: Value = admin
        .get(format!("{api}/auth/accounts/{account_id}"))
        .send()
        .await
        .expect("answers")
        .json()
        .await
        .expect("JSON");
    assert_eq!(account["status"], "PENDING");

    // Never record a login: the token is not an operation's result
    let operations: Value =
        admin.get(format!("{api}/tracker/operations")).send().await.expect("answers").json().await.expect("JSON");
    assert!(operations.as_array().expect("a list").iter().all(|record| record["name"] != "Login"));

    app.stop().await;
}
