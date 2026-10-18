//! Snapshot of an `Account`: the plain data the aggregate is persisted as and rebuilt from. It
//! is the only shape that crosses the domain boundary towards the infrastructure.

use std::time::SystemTime;

use shared_kernel_domain::Role;

use super::account_status::AccountStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountSnapshot {
    pub id: String,
    pub email: String,
    pub role: Role,
    pub credentials_hash: String,
    pub status: AccountStatus,
    pub last_authenticated_at: Option<SystemTime>,
    /// The version this snapshot was read at; the repository stores version + 1 (ADR 8).
    pub version: u64,
}

/// What is needed to register a brand new account.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewAccount {
    pub email: String,
    pub role: Role,
    pub password_hash: String,
    /// An administrator's account is usable at once; a self-registered one awaits validation.
    pub activated: bool,
}
