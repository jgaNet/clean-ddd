//! The Infrastructure layer of the Notifications context: the in-memory persistence, and one
//! adapter per `Channel` value.

pub mod channels;
pub mod queries;
pub mod repositories;

pub use channels::{EmailChannel, WebSocketChannel};
pub use queries::InMemoryNotificationQueries;
pub use repositories::InMemoryNotificationRepository;
