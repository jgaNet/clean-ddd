//! Reserved to administrators (and to the bootstrap, acting as the system): the one command of
//! the context whose rule needs no caller id, so it is a `guard()`. The account is usable at once.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Entity, Event, EventKind, Exception};
use security_domain::account::ports::account_repository::AccountRepository;
use security_domain::account::{AccountRegistration, NewAccount};
use security_domain::auth::ports::password_hasher::PasswordHasher;
use shared_kernel_domain::Role;

use crate::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterAdmin {
    pub email: String,
    pub password: String,
}

impl Event for RegisterAdmin {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for RegisterAdmin {
    const NAME: &'static str = "RegisterAdmin";
    type Output = String;
}

pub struct RegisterAdminCommandHandler<R, H> {
    repository: Arc<R>,
    registration: AccountRegistration<R>,
    hasher: Arc<H>,
}

impl<R, H> RegisterAdminCommandHandler<R, H> {
    pub fn new(repository: Arc<R>, registration: AccountRegistration<R>, hasher: Arc<H>) -> Self {
        Self { repository, registration, hasher }
    }
}

impl<R, H> CommandHandler for RegisterAdminCommandHandler<R, H>
where
    R: AccountRepository + Send + Sync + 'static,
    H: PasswordHasher + Send + Sync + 'static,
{
    type Command = RegisterAdmin;

    async fn guard(&self, _: &RegisterAdmin, context: &ExecutionContext) -> DomainResult {
        if context.auth().role.as_deref() != Some(Role::Admin.as_str()) {
            return Err(Exception::not_allowed(SERVICE, "Only an administrator can register another one"));
        }
        Ok(())
    }

    async fn execute(&self, command: RegisterAdmin, context: &ExecutionContext) -> DomainResult<String> {
        let account = self
            .registration
            .register(NewAccount {
                email: command.email,
                role: Role::Admin,
                password_hash: self.hasher.hash(&command.password).await,
                activated: true,
            })
            .await?;
        let account_id = account.id().value().to_string();

        self.repository.save(&account).await?;
        publish_domain_events(account, context).await;

        Ok(account_id)
    }
}
