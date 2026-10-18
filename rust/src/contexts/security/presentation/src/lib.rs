//! The Presentation layer of the Security context: the REST routes of authentication and
//! accounts, and the layer that identifies the caller of every request of the application.

pub mod authentication;
pub mod routes;

pub use authentication::{Authentication, Identify, authenticate};
pub use routes::auth_routes;
