//! The account is usable: the other contexts may welcome it.

use architecture_application::{EventHandler, ExecutionContext, publish_integration_event};
use architecture_domain::DomainResult;
use security_domain::account::AccountEvent;
use shared_kernel_application::integration_events::account_integration_events::AccountIntegrationEvent;

pub struct AccountValidatedHandler;

impl EventHandler for AccountValidatedHandler {
    type Event = AccountEvent;

    async fn execute(&self, event: AccountEvent, context: &ExecutionContext) -> DomainResult {
        let AccountEvent::Validated { account_id, email } = event else { return Ok(()) };
        if let Some(logger) = context.logger() {
            logger.debug(context.trace_id(), &format!("Account {account_id} validated"));
        }
        publish_integration_event(AccountIntegrationEvent::Validated { account_id, email }, context).await;
        Ok(())
    }
}
