//! Translates the domain fact into what other contexts need: a validation token the
//! Notifications context will email to the new account. An account opened active (by an
//! administrator, or the seed) has nothing to validate, so nothing leaves the context.

use std::sync::Arc;

use architecture_application::{EventHandler, ExecutionContext};
use architecture_domain::DomainResult;
use security_domain::account::{AccountEvent, AccountStatus};
use security_domain::auth::ports::signed_tokens::SignedTokens;
use security_domain::auth::{TokenPayload, VALIDATION_TOKEN};
use shared_kernel_application::integration_events::account_integration_events::AccountIntegrationEvent;

pub struct AccountCreatedHandler<T> {
    tokens: Arc<T>,
}

impl<T> AccountCreatedHandler<T> {
    pub fn new(tokens: Arc<T>) -> Self {
        Self { tokens }
    }
}

impl<T: SignedTokens + Send + Sync + 'static> EventHandler for AccountCreatedHandler<T> {
    type Event = AccountEvent;

    async fn execute(&self, event: AccountEvent, context: &ExecutionContext) -> DomainResult {
        let AccountEvent::Created { account_id, email, status, .. } = event else { return Ok(()) };
        if let Some(logger) = context.logger() {
            logger.debug(context.trace_id(), &format!("Account {account_id} created"));
        }
        if status == AccountStatus::Active {
            return Ok(());
        }

        let validation_token = self
            .tokens
            .issue(TokenPayload { subject_id: account_id.clone(), subject_type: VALIDATION_TOKEN.into() })
            .await;
        context.publish(AccountIntegrationEvent::Created { account_id, email, validation_token }).await;
        Ok(())
    }
}
