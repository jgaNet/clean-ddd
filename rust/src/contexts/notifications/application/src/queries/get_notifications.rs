//! An inbox: an account reads its own; an administrator may read anyone's. The rule is about
//! the caller, so it is a `guard()`.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Query, QueryHandler};
use architecture_domain::{DomainResult, Exception};
use notifications_domain::notification::ports::notification_queries::{
    InboxFilters, NotificationListItem, NotificationQueries,
};
use shared_kernel_application::require_signed_in;
use shared_kernel_domain::Role;

use crate::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetNotifications {
    pub recipient_id: String,
    pub filters: InboxFilters,
}

impl Query for GetNotifications {
    type Output = Inbox;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Inbox {
    pub notifications: Vec<NotificationListItem>,
    pub total: usize,
    pub unread: usize,
}

pub struct GetNotificationsQueryHandler<Q> {
    queries: Arc<Q>,
}

impl<Q> GetNotificationsQueryHandler<Q> {
    pub fn new(queries: Arc<Q>) -> Self {
        Self { queries }
    }
}

impl<Q: NotificationQueries + Send + Sync + 'static> QueryHandler for GetNotificationsQueryHandler<Q> {
    type Query = GetNotifications;

    async fn guard(&self, query: &GetNotifications, context: &ExecutionContext) -> DomainResult {
        let reader = require_signed_in(context, SERVICE)?;
        let is_admin = context.auth().role.as_deref() == Some(Role::Admin.as_str());
        if !is_admin && reader.value() != query.recipient_id {
            return Err(Exception::not_allowed(SERVICE, "Only the recipient or an administrator can read an inbox"));
        }
        Ok(())
    }

    async fn execute(&self, query: GetNotifications, _: &ExecutionContext) -> DomainResult<Inbox> {
        let recipient_id = &query.recipient_id;
        Ok(Inbox {
            notifications: self.queries.find_by_recipient(recipient_id, query.filters).await,
            total: self.queries.count_by_recipient(recipient_id, false).await,
            unread: self.queries.count_by_recipient(recipient_id, true).await,
        })
    }
}
