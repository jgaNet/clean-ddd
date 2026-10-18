//! Loads and saves the `Notification` aggregate, attempts included.

use std::future::Future;

use architecture_domain::DomainResult;

use super::super::Notification;

pub trait NotificationRepository {
    fn find_by_id(&self, id: &str) -> impl Future<Output = Option<Notification>> + Send;
    /// Stores the aggregate at version + 1, or refuses it with a concurrency conflict (ADR 8).
    fn save(&self, notification: &Notification) -> impl Future<Output = DomainResult> + Send;
}
