//! Who may validate an account: an administrator, for any account, or whoever holds the
//! validation token that was emailed for it. The token is verified here, not in the controller,
//! so that the rule cannot be bypassed by publishing the command another way.

use std::sync::Arc;

use architecture_application::{CommandHandler, ExecutionContext, publish_domain_events};
use architecture_domain::{CommandEvent, DomainResult, Entity, Event, EventKind, Exception};
use security_domain::account::account_exceptions::account_not_found;
use security_domain::account::ports::account_repository::AccountRepository;
use security_domain::auth::VALIDATION_TOKEN;
use security_domain::auth::ports::signed_tokens::SignedTokens;
use shared_kernel_domain::Role;

use crate::SERVICE;

/// Two ways to ask: with the token emailed at sign-up (anyone holding it), or by account id
/// (administrators only). The handler establishes which one applies from the caller and the
/// token itself; nothing in the payload is taken as proof of anything.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidateAccount {
    ById { account_id: String },
    ByToken { validation_token: String },
}

impl Event for ValidateAccount {
    fn name(&self) -> &'static str {
        Self::NAME
    }

    fn kind(&self) -> EventKind {
        EventKind::Command
    }
}

impl CommandEvent for ValidateAccount {
    const NAME: &'static str = "ValidateAccount";
    type Output = String;
}

pub struct ValidateAccountCommandHandler<R, T> {
    repository: Arc<R>,
    tokens: Arc<T>,
}

impl<R, T> ValidateAccountCommandHandler<R, T> {
    pub fn new(repository: Arc<R>, tokens: Arc<T>) -> Self {
        Self { repository, tokens }
    }
}

impl<R, T> ValidateAccountCommandHandler<R, T>
where
    T: SignedTokens + Send + Sync,
{
    async fn account_id_allowed_for(
        &self,
        command: ValidateAccount,
        context: &ExecutionContext,
    ) -> DomainResult<String> {
        match command {
            ValidateAccount::ByToken { validation_token } => match self.tokens.verify(&validation_token).await {
                Some(claims) if claims.subject_type == VALIDATION_TOKEN => Ok(claims.subject_id),
                _ => Err(Exception::not_allowed(SERVICE, "Invalid validation token")),
            },
            ValidateAccount::ById { account_id } => {
                if context.auth().role.as_deref() != Some(Role::Admin.as_str()) {
                    return Err(Exception::not_allowed(SERVICE, "Only an administrator can validate an account by id"));
                }
                Ok(account_id)
            }
        }
    }
}

impl<R, T> CommandHandler for ValidateAccountCommandHandler<R, T>
where
    R: AccountRepository + Send + Sync + 'static,
    T: SignedTokens + Send + Sync + 'static,
{
    type Command = ValidateAccount;

    async fn execute(&self, command: ValidateAccount, context: &ExecutionContext) -> DomainResult<String> {
        let account_id = self.account_id_allowed_for(command, context).await?;

        let Some(mut account) = self.repository.find_by_id(&account_id).await else {
            return Err(account_not_found(&account_id));
        };
        account.validate()?;

        self.repository.save(&account).await?;
        let account_id = account.id().value().to_string();
        publish_domain_events(account, context).await;

        Ok(account_id)
    }
}
