//! The REST routes of authentication and accounts. Sign-up and validation are commands:
//! accepted (202) and followed through the operation. Login answers synchronously, with the
//! token the client needs, by running the command through the module rather than publishing
//! it, in JSON or HTMX depending on the request (see the presenters). `me` and the account by
//! id are queries.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Module};
use architecture_domain::Exception;
use architecture_domain::common_exceptions::NOT_ALLOWED;
use architecture_presentation::{Format, accept, format_of, refused, status_of};
use axum::Router;
use axum::extract::{Extension, Path, Query, State};
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use security_application::commands::login::Login;
use security_application::commands::sign_up::SignUp;
use security_application::commands::validate_account::ValidateAccount;
use security_application::queries::get_account::GetAccount;
use serde::Deserialize;

use crate::presenters::{
    AccountViewModel, ERROR, ErrorViewModel, LOGGED_IN, LOGGED_OUT, LoginViewModel, LogoutViewModel, ME, SIGN_IN_AGAIN,
};

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
    headers: HeaderMap,
    Json(body): Json<CredentialsBody>,
) -> Response {
    let format = format_of(&headers);
    let login = Login { identifier: body.identifier, password: body.password };
    match module.command::<Login>().run(login, &context).await {
        Ok(logged_in) => {
            let cookie = format!("token={}; Path=/; HttpOnly; Secure; SameSite=Strict", logged_in.token);
            with_cookie(LOGGED_IN.present(format, &LoginViewModel { token: logged_in.token }), &cookie)
        }
        Err(error) => with_status(
            ERROR.present(format, &ErrorViewModel { message: error.message().to_string() }),
            StatusCode::UNAUTHORIZED,
        ),
    }
}

async fn me(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
    headers: HeaderMap,
) -> Response {
    let format = format_of(&headers);
    let id = context.auth().subject_id.clone().unwrap_or_default();
    match module.query::<GetAccount>().handle(GetAccount { id }, &context).await {
        Ok(account) => ME.present(format, &AccountViewModel::from(account)),
        Err(error) => {
            let message = ErrorViewModel { message: error.message().to_string() };
            if error.is(NOT_ALLOWED) {
                // HTMX swaps the login form back in; an API client gets a 401.
                return match format {
                    Format::Htmx => SIGN_IN_AGAIN.present(format, &message),
                    Format::Json => with_status(SIGN_IN_AGAIN.present(format, &message), StatusCode::UNAUTHORIZED),
                };
            }
            with_status(ERROR.present(format, &message), StatusCode::BAD_REQUEST)
        }
    }
}

async fn logout(headers: HeaderMap) -> Response {
    let cookie = "token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
    with_cookie(LOGGED_OUT.present(format_of(&headers), &LogoutViewModel { message: "Logout successful" }), cookie)
}

fn with_status(mut response: Response, status: StatusCode) -> Response {
    *response.status_mut() = status;
    response
}

fn with_cookie(mut response: Response, cookie: &str) -> Response {
    if let Ok(value) = HeaderValue::from_str(cookie) {
        response.headers_mut().insert(SET_COOKIE, value);
    }
    response
}

async fn get_account(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
    Path(id): Path<String>,
) -> Response {
    match module.query::<GetAccount>().handle(GetAccount { id }, &context).await {
        Ok(account) => Json(AccountViewModel::from(account)).into_response(),
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
