//! The transport, and nothing of the business: an axum server that gives each request its
//! identity and its `ExecutionContext`, answers the origins it is given (CORS), serves the routes
//! it is given under one API prefix, and listens. It names no context; a composition root builds
//! the bus, the stores and the modules, hands them to an [`AxumApplication`], mounts each
//! context's routes on it, and starts it.

pub mod axum_application;

pub use axum_application::{AxumApplication, AxumApplicationOptions, Running, TransportSettings};
