//! The Domain layer of the Security context: the `Account` aggregate — who can sign in, and as
//! what — with its value objects, its events, its exceptions, its snapshot, its ports, the
//! domain service that registers one, and the two technical ports authentication needs
//! (hashing a password, signing a token), declared here in business words and answered by the
//! infrastructure.

pub mod account;
pub mod auth;
