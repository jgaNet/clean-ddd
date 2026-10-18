//! The home of the API and the front end, end to end: the same route in two formats, and the
//! page the browser loads.

mod support;

use serde_json::{Value, json};
use support::start_test_application;

#[tokio::test]
async fn the_home_answers_json_to_a_client_and_the_page_shell_to_htmx() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let client = app.anonymous();

    let home = client.get(&api).send().await.expect("answers");
    assert_eq!(home.status(), 200);
    assert_eq!(home.json::<Value>().await.expect("JSON"), json!({ "name": "clean-ddd", "version": "3.1.0" }));

    let shell = client.get(&api).header("HX-Request", "true").send().await.expect("answers");
    assert_eq!(shell.status(), 200);
    assert!(shell.headers()["content-type"].to_str().unwrap().starts_with("text/html"));
    let shell = shell.text().await.expect("text");
    assert!(shell.contains("<main") && shell.contains("<h1>clean-ddd</h1>"));

    let health: Value = client.get(format!("{api}/health")).send().await.expect("answers").json().await.expect("JSON");
    assert_eq!(health["status"], "ok");

    app.stop().await;
}

#[tokio::test]
async fn the_front_end_is_served_beside_the_api_and_speaks_htmx() {
    let app = start_test_application().await;
    let api = app.api.clone();
    let root = api.trim_end_matches("/v1").to_string();
    let client = app.anonymous();

    // The page, and the page again for a route of the front end
    for path in ["/", "/me"] {
        let page = client.get(format!("{root}{path}")).send().await.expect("answers");
        assert_eq!(page.status(), 200);
        assert!(page.text().await.expect("text").contains(r#"<script src="/js/htmx.min.js"></script>"#));
    }
    assert_eq!(client.get(format!("{root}/js/htmx.min.js")).send().await.expect("answers").status(), 200);

    // Not signed in: HTMX gets the login form, an API client a 401
    let form = client.get(format!("{api}/auth/me")).header("HX-Request", "true").send().await.expect("answers");
    assert_eq!(form.status(), 200);
    assert!(form.text().await.expect("text").contains(r#"hx-post="/v1/auth/login""#));
    assert_eq!(client.get(format!("{api}/auth/me")).send().await.expect("answers").status(), 401);

    // Logged in through the form: the fragment that loads the account, with the cookie
    let logged_in = client
        .post(format!("{api}/auth/login"))
        .header("HX-Request", "true")
        .json(&json!({ "identifier": "admin@admin.fr", "password": "admin" }))
        .send()
        .await
        .expect("answers");
    assert_eq!(logged_in.status(), 200);
    assert!(logged_in.headers().get("set-cookie").is_some());
    assert!(logged_in.text().await.expect("text").contains(r#"hx-get="/v1/auth/me""#));
    let refused = client
        .post(format!("{api}/auth/login"))
        .header("HX-Request", "true")
        .json(&json!({ "identifier": "admin@admin.fr", "password": "nope" }))
        .send()
        .await
        .expect("answers");
    assert_eq!(refused.status(), 401);
    assert!(refused.text().await.expect("text").contains("alert"));

    // The account page and the new-note form, as the front end loads them
    let admin = app.admin().await;
    let me = admin.get(format!("{api}/auth/me")).header("HX-Request", "true").send().await.expect("answers");
    assert!(me.text().await.expect("text").contains("Welcome admin@admin.fr"));
    let form = admin.get(format!("{api}/notes/new")).send().await.expect("answers");
    assert!(form.text().await.expect("text").contains(r#"hx-post="/v1/notes""#));
    let logout = admin.post(format!("{api}/auth/logout")).header("HX-Request", "true").send().await.expect("answers");
    assert!(logout.text().await.expect("text").contains("Login"));

    app.stop().await;
}
