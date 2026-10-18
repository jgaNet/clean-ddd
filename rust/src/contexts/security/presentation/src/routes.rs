//! The REST routes of authentication and accounts. Sign-up and validation are commands:
//! accepted (202) and followed through the operation. Login answers synchronously, with the
//! token the client needs, by running the command through the module rather than publishing
//! it. `me` and the account by id are queries.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Module};
use architecture_domain::Exception;
use architecture_domain::common_exceptions::NOT_ALLOWED;
use architecture_presentation::{accept, refused, status_of};
use axum::Router;
use axum::extract::{Extension, Path, Query, State};
use axum::http::StatusCode;
use axum::http::header::SET_COOKIE;
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use chrono::{DateTime, Utc};
use security_application::commands::login::Login;
use security_application::commands::sign_up::SignUp;
use security_application::commands::validate_account::ValidateAccount;
use security_application::queries::get_account::GetAccount;
use security_domain::account::ports::account_queries::AccountDetail;
use serde::{Deserialize, Serialize};

/// `/auth/…`: sign-up, validation, login, logout, the caller's own account, an account by id.
pub fn auth_routes(module: Arc<Module>) -> Router {
    Router::new()
        .route("/auth/signup", post(sign_up))
        .route("/auth/validate", get(validate))
        .route("/auth/me", get(me))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/auth/accounts/{id}", get(get_account))
        .route("/auth/accounts/{id}/validate", get(validate_account_by_id))
        .with_state(module)
}

#[derive(Debug, Deserialize)]
struct CredentialsBody {
    /// The account's email, as a login form calls it.
    identifier: String,
    password: String,
}

#[derive(Debug, Deserialize)]
struct ValidationQuery {
    validation_token: String,
}

/// An account as the API shows it; never the credentials.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AccountView {
    id: String,
    email: String,
    role: &'static str,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_authenticated_at: Option<DateTime<Utc>>,
}

impl From<AccountDetail> for AccountView {
    fn from(account: AccountDetail) -> Self {
        Self {
            id: account.id,
            email: account.email,
            role: account.role.as_str(),
            status: account.status.as_str(),
            last_authenticated_at: account.last_authenticated_at.map(DateTime::<Utc>::from),
        }
    }
}

#[derive(Debug, Serialize)]
struct Message {
    message: &'static str,
}

/// `{ error }`: how the auth routes word a refusal, as the TypeScript presenters do.
#[derive(Debug, Serialize)]
struct Error {
    error: String,
}

async fn sign_up(Extension(context): Extension<ExecutionContext>, Json(body): Json<CredentialsBody>) -> Response {
    if let Some(logger) = context.logger() {
        logger.info(context.trace_id(), &format!("Creating new account {}", body.identifier));
    }
    // The password is hashed by the handler, behind the PasswordHasher port.
    accept(&context, SignUp { email: body.identifier, password: body.password }).into_response()
}

async fn validate(Extension(context): Extension<ExecutionContext>, Query(query): Query<ValidationQuery>) -> Response {
    // The token is verified by the handler; whether it is valid is the operation's outcome.
    accept(&context, ValidateAccount::ByToken { validation_token: query.validation_token }).into_response()
}

/// Login answers synchronously: the client needs the token, so the command is run here, not published.
async fn login(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
    Json(body): Json<CredentialsBody>,
) -> Response {
    let login = Login { identifier: body.identifier, password: body.password };
    match module.command::<Login>().run(login, &context).await {
        Ok(logged_in) => {
            let cookie = format!("token={}; Path=/; HttpOnly; Secure; SameSite=Strict", logged_in.token);
            ([(SET_COOKIE, cookie)], Json(logged_in)).into_response()
        }
        Err(error) => (StatusCode::UNAUTHORIZED, Json(Error { error: error.message().to_string() })).into_response(),
    }
}

async fn me(State(module): State<Arc<Module>>, Extension(context): Extension<ExecutionContext>) -> Response {
    let id = context.auth().subject_id.clone().unwrap_or_default();
    match module.query::<GetAccount>().handle(GetAccount { id }, &context).await {
        Ok(account) => Json(AccountView::from(account)).into_response(),
        Err(error) => {
            // An API client that is not signed in gets a 401.
            let status = if error.is(NOT_ALLOWED) { StatusCode::UNAUTHORIZED } else { StatusCode::BAD_REQUEST };
            (status, Json(Error { error: error.message().to_string() })).into_response()
        }
    }
}

async fn logout() -> Response {
    let cookie = "token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
    ([(SET_COOKIE, cookie)], Json(Message { message: "Logout successful" })).into_response()
}

async fn get_account(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
    Path(id): Path<String>,
) -> Response {
    match module.query::<GetAccount>().handle(GetAccount { id }, &context).await {
        Ok(account) => Json(AccountView::from(account)).into_response(),
        Err(error) => refuse(error),
    }
}

async fn validate_account_by_id(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    // Whether this caller may validate by id is the handler's decision, from the context.
    accept(&context, ValidateAccount::ById { account_id: id }).into_response()
}

fn refuse(error: Exception) -> Response {
    refused(status_of(&error), &error)
}
