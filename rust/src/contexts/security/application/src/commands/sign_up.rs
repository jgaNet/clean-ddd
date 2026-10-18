//! Self-registration: anyone may sign up, the account stays `Pending` until the email is
//! validated (see `AccountCreatedHandler`, which sends the validation token).

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Entity, Event, EventKind};
use security_domain::account::ports::account_repository::AccountRepository;
use security_domain::account::{AccountRegistration, NewAccount};
use security_domain::auth::ports::password_hasher::PasswordHasher;
use shared_kernel_domain::Role;

/// The password travels in clear inside the process only; it is hashed before anything is stored.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignUp {
    pub email: String,
    pub password: String,
}

impl Event for SignUp {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for SignUp {
    const NAME: &'static str = "SignUp";
    /// The id of the account, which the aggregate chose.
    type Output = String;
}

pub struct SignUpCommandHandler<R, H> {
    repository: Arc<R>,
    registration: AccountRegistration<R>,
    hasher: Arc<H>,
}

impl<R, H> SignUpCommandHandler<R, H> {
    pub fn new(repository: Arc<R>, registration: AccountRegistration<R>, hasher: Arc<H>) -> Self {
        Self { repository, registration, hasher }
    }
}

impl<R, H> CommandHandler for SignUpCommandHandler<R, H>
where
    R: AccountRepository + Send + Sync + 'static,
    H: PasswordHasher + Send + Sync + 'static,
{
    type Command = SignUp;

    async fn execute(&self, command: SignUp, context: &ExecutionContext) -> DomainResult<String> {
        let account = self
            .registration
            .register(NewAccount {
                email: command.email,
                role: Role::User,
                password_hash: self.hasher.hash(&command.password).await,
                activated: false,
            })
            .await?;
        let account_id = account.id().value().to_string();

        self.repository.save(&account).await?;
        publish_domain_events(account, context).await;

        Ok(account_id)
    }
}
