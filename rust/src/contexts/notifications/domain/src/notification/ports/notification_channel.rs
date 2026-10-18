//! One implementation per `Channel` value, in the infrastructure (websocket, email...). The
//! port knows nothing about logging or transport: an adapter that needs a logger takes it in
//! its constructor.

use std::future::Future;

use super::super::Metadata;
use super::super::channel::Channel;

/// What a channel receives: enough to deliver, nothing about how the aggregate is built.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Delivery {
    pub notification_id: String,
    pub recipient_id: String,
    pub title: String,
    pub content: String,
    pub metadata: Metadata,
}

pub trait NotificationChannel {
    fn channel(&self) -> Channel;
    fn is_available_for(&self, recipient_id: &str) -> impl Future<Output = bool> + Send;
    /// Delivered, or the reason it was not — for the log; the aggregate only records which.
    fn deliver(&self, delivery: &Delivery) -> impl Future<Output = Result<(), String>> + Send;
}
