//! The same use case answered in two formats: JSON for an API client, an HTML fragment for the
//! HTMX front end, which swaps it into the page. A presenter turns a view model into a body and
//! nothing else; which one answers is decided per request by the controller, from the headers.

use architecture_presentation::{ByFormat, Presenter};
use axum::response::{Html, IntoResponse, Json, Response};
use chrono::{DateTime, Utc};
use security_domain::account::ports::account_queries::AccountDetail;
use serde::Serialize;

/// An account as the API shows it; never the credentials.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountViewModel {
    pub id: String,
    pub email: String,
    pub role: &'static str,
    pub status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_authenticated_at: Option<DateTime<Utc>>,
}

impl From<AccountDetail> for AccountViewModel {
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

pub struct LoginViewModel {
    pub token: String,
}

pub struct ErrorViewModel {
    pub message: String,
}

pub struct LogoutViewModel {
    pub message: &'static str,
}

// JSON

pub struct LoggedInJsonPresenter;
impl Presenter<LoginViewModel> for LoggedInJsonPresenter {
    fn present(&self, data: &LoginViewModel) -> Response {
        Json(serde_json::json!({ "token": data.token })).into_response()
    }
}

pub struct MeJsonPresenter;
impl Presenter<AccountViewModel> for MeJsonPresenter {
    fn present(&self, data: &AccountViewModel) -> Response {
        Json(data).into_response()
    }
}

pub struct LogoutJsonPresenter;
impl Presenter<LogoutViewModel> for LogoutJsonPresenter {
    fn present(&self, data: &LogoutViewModel) -> Response {
        Json(serde_json::json!({ "message": data.message })).into_response()
    }
}

/// `{ error }`: how the auth routes word a refusal.
pub struct ErrorJsonPresenter;
impl Presenter<ErrorViewModel> for ErrorJsonPresenter {
    fn present(&self, data: &ErrorViewModel) -> Response {
        Json(serde_json::json!({ "error": data.message })).into_response()
    }
}

// HTMX

/// Logged in: the page loads the account. The fragment carries the token, so a page served from
/// another origin, where the cookie does not reach, can keep it and send it as a bearer.
pub struct LoggedInHtmxPresenter;
impl Presenter<LoginViewModel> for LoggedInHtmxPresenter {
    fn present(&self, data: &LoginViewModel) -> Response {
        Html(format!(
            r##"<div hx-get="/v1/auth/me" hx-trigger="load" hx-swap="innerHTML" hx-target="#app" data-token="{}"></div>"##,
            data.token
        ))
        .into_response()
    }
}

/// The account page: the live notifications, the greeting, the new-note form.
pub struct MeHtmxPresenter;
impl Presenter<AccountViewModel> for MeHtmxPresenter {
    fn present(&self, data: &AccountViewModel) -> Response {
        Html(format!(
            r##"<div ws-connect="/ws">
  <div id="notifications"></div>
  <div>
    <h3>
      Welcome {email}
      <button id="logout" hx-push-url="/" hx-post="/v1/auth/logout" hx-trigger="click" hx-ext="json-enc">Logout</button>
    </h3>
  </div>
  <div hx-get="/v1/notes/new" hx-trigger="load" hx-swap="outerHTML" hx-target="#new-note" id="new-note"></div>
</div>"##,
            email = escape(&data.email)
        ))
        .into_response()
    }
}

/// The login form, with the last error if any: what "not signed in" and "logged out" both show.
pub struct LoginHtmxPresenter;
impl Presenter<ErrorViewModel> for LoginHtmxPresenter {
    fn present(&self, data: &ErrorViewModel) -> Response {
        Html(login_form(&data.message)).into_response()
    }
}
impl Presenter<LogoutViewModel> for LoginHtmxPresenter {
    fn present(&self, _: &LogoutViewModel) -> Response {
        Html(login_form("")).into_response()
    }
}

pub struct ErrorHtmxPresenter;
impl Presenter<ErrorViewModel> for ErrorHtmxPresenter {
    fn present(&self, data: &ErrorViewModel) -> Response {
        Html(format!(r##"<div class="alert alert-danger" role="alert">{}</div>"##, escape(&data.message)))
            .into_response()
    }
}

fn login_form(message: &str) -> String {
    format!(
        r##"<div>
  <form hx-push-url="/me" hx-post="/v1/auth/login" hx-ext="json-enc" hx-target="#app" hx-target-error="#errors" hx-swap="innerHTML">
    <input name="identifier" placeholder="Identifier" />
    <input name="password" placeholder="Password" type="password" />
    <input type="submit" value="Login" />
  </form>
  <br />
  <div id="errors">{}</div>
  <script>history.pushState({{}}, '', '/');</script>
</div>"##,
        escape(message)
    )
}

/// What goes into a fragment is text, never markup: a view model's strings are escaped once, here.
pub fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// The presenters of the auth controller, one `ByFormat` per answer.
pub const LOGGED_IN: ByFormat<LoginViewModel> =
    ByFormat { json: &LoggedInJsonPresenter, htmx: Some(&LoggedInHtmxPresenter) };
pub const ME: ByFormat<AccountViewModel> = ByFormat { json: &MeJsonPresenter, htmx: Some(&MeHtmxPresenter) };
pub const LOGGED_OUT: ByFormat<LogoutViewModel> =
    ByFormat { json: &LogoutJsonPresenter, htmx: Some(&LoginHtmxPresenter) };
pub const ERROR: ByFormat<ErrorViewModel> = ByFormat { json: &ErrorJsonPresenter, htmx: Some(&ErrorHtmxPresenter) };
/// For the HTMX front end, "not signed in" is answered with the login form itself.
pub const SIGN_IN_AGAIN: ByFormat<ErrorViewModel> =
    ByFormat { json: &ErrorJsonPresenter, htmx: Some(&LoginHtmxPresenter) };
