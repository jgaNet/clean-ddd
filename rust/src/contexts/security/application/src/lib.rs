//! The Application layer of the Security context: signing up, logging in, validating an
//! account, registering an administrator; reading an account; and the reactions that tell the
//! other contexts what happened to one.

pub mod commands;
pub mod events;
pub mod queries;

/// The context that refuses, named in every guard and exception.
pub use security_domain::account::account_exceptions::SERVICE;
