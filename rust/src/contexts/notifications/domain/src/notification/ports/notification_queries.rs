//! What an inbox shows. The attempts stay inside the aggregate.

use std::future::Future;
use std::time::SystemTime;

use super::super::Metadata;
use super::super::channel::Channel;
use super::super::notification_status::NotificationStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationListItem {
    pub id: String,
    pub recipient_id: String,
    pub title: String,
    pub content: String,
    pub status: NotificationStatus,
    pub channels: Vec<Channel>,
    pub delivered_via: Option<Channel>,
    pub created_at: SystemTime,
    pub sent_at: Option<SystemTime>,
    pub read_at: Option<SystemTime>,
    pub metadata: Metadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct InboxFilters {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub only_unread: bool,
}

pub trait NotificationQueries {
    /// Newest first; `only_unread` keeps the delivered, unread ones.
    fn find_by_recipient(
        &self,
        recipient_id: &str,
        filters: InboxFilters,
    ) -> impl Future<Output = Vec<NotificationListItem>> + Send;
    fn count_by_recipient(&self, recipient_id: &str, only_unread: bool) -> impl Future<Output = usize> + Send;
}
