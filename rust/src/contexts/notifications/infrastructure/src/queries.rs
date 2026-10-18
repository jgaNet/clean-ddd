//! The read side of the same store: an inbox, newest first, paged, unread on demand.

use std::sync::Arc;

use architecture_infrastructure::InMemoryDataSource;
use notifications_domain::notification::ports::notification_queries::{
    InboxFilters, NotificationListItem, NotificationQueries,
};
use notifications_domain::notification::{NotificationSnapshot, NotificationStatus};

pub struct InMemoryNotificationQueries {
    store: Arc<InMemoryDataSource<NotificationSnapshot>>,
}

impl InMemoryNotificationQueries {
    pub fn new(store: Arc<InMemoryDataSource<NotificationSnapshot>>) -> Self {
        Self { store }
    }

    fn inbox(&self, recipient_id: &str, only_unread: bool) -> Vec<NotificationSnapshot> {
        self.store
            .all()
            .into_iter()
            .filter(|n| n.recipient_id == recipient_id && (!only_unread || n.status == NotificationStatus::Sent))
            .collect()
    }
}

impl NotificationQueries for InMemoryNotificationQueries {
    async fn find_by_recipient(&self, recipient_id: &str, filters: InboxFilters) -> Vec<NotificationListItem> {
        let mut inbox = self.inbox(recipient_id, filters.only_unread);
        // Newest first; two created at the same instant keep their insertion order, so the later one comes last.
        inbox.sort_by_key(|n| std::cmp::Reverse(n.created_at));
        inbox
            .into_iter()
            .skip(filters.offset.unwrap_or(0))
            .take(filters.limit.unwrap_or(20))
            .map(to_list_item)
            .collect()
    }

    async fn count_by_recipient(&self, recipient_id: &str, only_unread: bool) -> usize {
        self.inbox(recipient_id, only_unread).len()
    }
}

fn to_list_item(n: NotificationSnapshot) -> NotificationListItem {
    NotificationListItem {
        id: n.id,
        recipient_id: n.recipient_id,
        title: n.title,
        content: n.content,
        status: n.status,
        channels: n.channels,
        delivered_via: n.delivered_via,
        created_at: n.created_at,
        sent_at: n.sent_at,
        read_at: n.read_at,
        metadata: n.metadata,
    }
}
