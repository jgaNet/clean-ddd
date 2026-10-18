//! Identifies the caller of every request. It never blocks: a missing or bad token simply
//! makes the request anonymous, and each handler's guard decides what an anonymous caller may
//! do. A token is accepted only if its signature and expiry check out (`SignedTokens::verify`),
//! the account still exists and is active, and the role it claims is the account's current role.
//!
//! The composition root installs [`authenticate`] as a layer over every route; the `Auth` it
//! establishes travels as a request extension to the layer that builds the execution context.
//! The layer sees the authentication through `dyn` ([`Identify`]), so the composition root
//! never names the adapters behind it.

use std::sync::Arc;

use architecture_application::{Auth, BoxFuture};
use axum::extract::{Request, State};
use axum::http::HeaderMap;
use axum::http::header::{AUTHORIZATION, COOKIE};
use axum::middleware::Next;
use axum::response::Response;
use security_domain::account::AccountStatus;
use security_domain::account::ports::account_queries::AccountQueries;
use security_domain::auth::ports::signed_tokens::SignedTokens;
use shared_kernel_domain::Role;

pub struct Authentication<Q, T> {
    accounts: Arc<Q>,
    tokens: Arc<T>,
}

impl<Q: AccountQueries, T: SignedTokens> Authentication<Q, T> {
    pub fn new(accounts: Arc<Q>, tokens: Arc<T>) -> Self {
        Self { accounts, tokens }
    }

    /// Who is behind a request, from its headers and its query string: the account its token
    /// names, or nobody.
    pub async fn identify(&self, headers: &HeaderMap, query: Option<&str>) -> Auth {
        let Some(token) =
            token_from_cookie(headers).or_else(|| token_from_header(headers)).or_else(|| token_from_query(query))
        else {
            return Auth::anonymous();
        };
        let Some(claims) = self.tokens.verify(&token).await else { return Auth::anonymous() };
        // A validation token does not sign anyone in.
        let Some(role) = Role::parse(&claims.subject_type) else { return Auth::anonymous() };
        match self.accounts.find_by_id(&claims.subject_id).await {
            Some(account) if account.status == AccountStatus::Active && account.role == role => {
                Auth::of(&account.id, role.as_str())
            }
            _ => Auth::anonymous(),
        }
    }
}

/// The authentication as the layer holds it.
pub trait Identify: Send + Sync {
    fn identify<'a>(&'a self, headers: &'a HeaderMap, query: Option<&'a str>) -> BoxFuture<'a, Auth>;
}

impl<Q, T> Identify for Authentication<Q, T>
where
    Q: AccountQueries + Send + Sync + 'static,
    T: SignedTokens + Send + Sync + 'static,
{
    fn identify<'a>(&'a self, headers: &'a HeaderMap, query: Option<&'a str>) -> BoxFuture<'a, Auth> {
        Box::pin(Authentication::identify(self, headers, query))
    }
}

/// The layer: `Router::layer(middleware::from_fn_with_state(authentication, authenticate))`.
pub async fn authenticate(
    State(authentication): State<Arc<dyn Identify>>,
    mut request: Request,
    next: Next,
) -> Response {
    let auth = authentication.identify(request.headers(), request.uri().query()).await;
    request.extensions_mut().insert(auth);
    next.run(request).await
}

fn token_from_header(headers: &HeaderMap) -> Option<String> {
    let header = headers.get(AUTHORIZATION)?.to_str().ok()?;
    header.strip_prefix("Bearer ").map(str::to_string)
}

fn token_from_cookie(headers: &HeaderMap) -> Option<String> {
    let cookie = headers.get(COOKIE)?.to_str().ok()?;
    cookie.split(';').map(str::trim).find_map(|part| part.strip_prefix("token=")).map(str::to_string)
}

fn token_from_query(query: Option<&str>) -> Option<String> {
    query?.split('&').find_map(|pair| pair.strip_prefix("token=")).map(str::to_string)
}
