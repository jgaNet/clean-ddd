//! Login answers synchronously (the caller needs the token), so the controller runs the command
//! through the module (`module.command::<Login>().run(…)`) instead of publishing it: the token
//! never travels through the bus and never reaches the Tracker's records.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Entity, Event, EventKind};
use security_domain::account::account_exceptions::invalid_credentials;
use security_domain::account::ports::account_repository::AccountRepository;
use security_domain::auth::TokenPayload;
use security_domain::auth::ports::password_hasher::PasswordHasher;
use security_domain::auth::ports::signed_tokens::SignedTokens;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Login {
    /// The account's email; the field is named for what a login form calls it.
    pub identifier: String,
    pub password: String,
}

impl Event for Login {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for Login {
    const NAME: &'static str = "Login";
    type Output = LoggedIn;
}

/// The session token, for the role of the account.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LoggedIn {
    pub token: String,
}

pub struct LoginCommandHandler<R, H, T> {
    repository: Arc<R>,
    hasher: Arc<H>,
    tokens: Arc<T>,
}

impl<R, H, T> LoginCommandHandler<R, H, T> {
    pub fn new(repository: Arc<R>, hasher: Arc<H>, tokens: Arc<T>) -> Self {
        Self { repository, hasher, tokens }
    }
}

impl<R, H, T> CommandHandler for LoginCommandHandler<R, H, T>
where
    R: AccountRepository + Send + Sync + 'static,
    H: PasswordHasher + Send + Sync + 'static,
    T: SignedTokens + Send + Sync + 'static,
{
    type Command = Login;

    async fn execute(&self, command: Login, context: &ExecutionContext) -> DomainResult<LoggedIn> {
        let Some(mut account) = self.repository.find_by_email(&command.identifier.trim().to_lowercase()).await else {
            return Err(invalid_credentials());
        };
        if !self.hasher.compare(&command.password, account.credentials().hash()).await {
            return Err(invalid_credentials());
        }

        account.authenticate()?;

        self.repository.save(&account).await?;
        let token = self
            .tokens
            .issue(TokenPayload {
                subject_id: account.id().value().to_string(),
                subject_type: account.role().as_str().to_string(),
            })
            .await;
        publish_domain_events(account, context).await;

        Ok(LoggedIn { token })
    }
}
