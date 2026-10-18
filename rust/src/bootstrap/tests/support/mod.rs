//! Boots the real application in this process, on a free port, with fresh in-memory stores,
//! seeded with the administrator from the settings. Each end-to-end suite starts its own and
//! stops it afterwards, so suites neither share state nor depend on their order. The tests
//! still talk HTTP: what they prove is what a client would see.
//!
//! This is the Rust `application.spec-helper`: the e2e tests depend on the bootstrap and on the
//! HTTP client, and reach into no layer (ARCH-E2E).

#![allow(dead_code)]

use std::sync::Arc;
use std::time::Duration;

use architecture_application::Logger;
use bootstrap::{Running, Settings, create_application};
use reqwest::header::{AUTHORIZATION, HeaderMap, HeaderValue};
use reqwest::{Client, Response};
use serde_json::{Value, json};

/// A logger that says nothing: the tests read the HTTP answers, not the console.
struct Quiet;
impl Logger for Quiet {
    fn info(&self, _: &str, _: &str) {}
    fn warn(&self, _: &str, _: &str) {}
    fn error(&self, _: &str, _: &str, _: &str) {}
    fn debug(&self, _: &str, _: &str) {}
}

pub struct TestApplication {
    /// Base URL of the API of this instance, e.g. `http://127.0.0.1:53210/v1`.
    pub api: String,
    running: Option<Running>,
}

pub async fn start_test_application() -> TestApplication {
    let running = create_application(Settings::for_tests(), Arc::new(Quiet)).await.start().await.expect("a free port");
    TestApplication { api: format!("{}/v1", running.address()), running: Some(running) }
}

impl TestApplication {
    /// An anonymous client.
    pub fn anonymous(&self) -> Client {
        Client::new()
    }

    pub async fn login(&self, identifier: &str, password: &str) -> Response {
        self.anonymous()
            .post(format!("{}/auth/login", self.api))
            .json(&json!({ "identifier": identifier, "password": password }))
            .send()
            .await
            .expect("login answers")
    }

    /// A client carrying the bearer token of that account.
    pub async fn agent_as(&self, identifier: &str, password: &str) -> Client {
        let token = self.login(identifier, password).await.json::<Value>().await.expect("JSON")["token"]
            .as_str()
            .expect("a token")
            .to_string();
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Bearer {token}")).expect("a header"));
        Client::builder().default_headers(headers).build().expect("a client")
    }

    pub async fn admin(&self) -> Client {
        self.agent_as("admin@admin.fr", "admin").await
    }

    /// Follows an accepted command to its outcome: the operation, once it is no longer pending.
    /// A client holding a `202` does the same; the dispatch runs after the answer (ADR 14).
    pub async fn operation(&self, client: &Client, operation_id: &str) -> Value {
        for _ in 0..200 {
            let response =
                client.get(format!("{}/tracker/operations/{operation_id}", self.api)).send().await.expect("answers");
            if response.status().is_success() {
                let operation: Value = response.json().await.expect("JSON");
                if operation["status"] != "PENDING" {
                    return operation;
                }
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        panic!("operation {operation_id} did not reach an outcome in time");
    }

    /// Accepts a command and follows it: the operation at its outcome.
    pub async fn accepted(&self, client: &Client, response: Response) -> Value {
        assert_eq!(response.status(), 202, "accepted");
        let body: Value = response.json().await.expect("JSON");
        self.operation(client, body["operationId"].as_str().expect("an operation id")).await
    }

    /// Signs up a new account, validates it as the administrator, and returns its id: a fresh, usable user.
    pub async fn sign_up_validated(&self, identifier: &str, password: &str) -> String {
        let admin = self.admin().await;
        let sign_up = self
            .anonymous()
            .post(format!("{}/auth/signup", self.api))
            .json(&json!({ "identifier": identifier, "password": password }))
            .send()
            .await
            .expect("sign-up answers");
        let account_id = self.accepted(&admin, sign_up).await["result"].as_str().expect("an account id").to_string();
        let validate =
            admin.get(format!("{}/auth/accounts/{account_id}/validate", self.api)).send().await.expect("answers");
        self.accepted(&admin, validate).await;
        account_id
    }

    pub async fn stop(mut self) {
        if let Some(running) = self.running.take() {
            running.stop().await;
        }
    }
}
