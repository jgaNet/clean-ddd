//! The repository port on the in-memory store, with the same version rule as every repository
//! of the reference: version + 1 on save, a conflict for a stale aggregate (ADR 8).

use std::sync::Arc;

use architecture_domain::{DomainResult, Entity, Exception};
use architecture_infrastructure::InMemoryDataSource;
use notifications_domain::notification::notification_exceptions::SERVICE;
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use notifications_domain::notification::{Notification, NotificationSnapshot};

pub struct InMemoryNotificationRepository {
    store: Arc<InMemoryDataSource<NotificationSnapshot>>,
}

impl InMemoryNotificationRepository {
    pub fn new(store: Arc<InMemoryDataSource<NotificationSnapshot>>) -> Self {
        Self { store }
    }
}

impl NotificationRepository for InMemoryNotificationRepository {
    async fn find_by_id(&self, id: &str) -> Option<Notification> {
        self.store.get(id).map(Notification::from_snapshot)
    }

    async fn save(&self, notification: &Notification) -> DomainResult {
        let id = notification.id().value();
        if let Some(stored) = self.store.get(id)
            && stored.version != notification.version()
        {
            return Err(Exception::concurrency_conflict(SERVICE, "The notification changed since it was read")
                .with("notificationId", id)
                .with("read", notification.version())
                .with("stored", stored.version));
        }
        let mut snapshot = notification.to_snapshot();
        snapshot.version = notification.version() + 1;
        self.store.set(id, snapshot);
        Ok(())
    }
}
