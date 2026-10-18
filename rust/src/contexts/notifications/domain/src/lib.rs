//! The Domain layer of the Notifications context: the `Notification` aggregate — something to
//! tell one account, and the story of how it was delivered — with the entity inside it (a
//! delivery attempt), its value objects, its events, its exceptions, its snapshot and its ports.

pub mod notification;
