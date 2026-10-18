//! The Application layer of the Notifications context: the one use case every entry point ends
//! in (`NotificationDelivery`), the two commands, the inbox query, and the anti-corruption
//! handlers that turn the other contexts' facts into notifications.

pub mod commands;
pub mod delivery;
pub mod events;
pub mod queries;

/// The context that refuses, named in every guard and exception.
pub use notifications_domain::notification::notification_exceptions::SERVICE;
