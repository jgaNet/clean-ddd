//! Write side of persistence: loads and saves the `Account` aggregate. `find_by_email` is here,
//! not in the queries, because the domain itself needs it (`AccountRegistration`) and the
//! result is an aggregate, not a read model.

use std::future::Future;

use architecture_domain::DomainResult;

use super::super::Account;

pub trait AccountRepository {
    fn find_by_id(&self, id: &str) -> impl Future<Output = Option<Account>> + Send;
    /// By the normalised email (trimmed, lower-cased), as `Email` stores it.
    fn find_by_email(&self, email: &str) -> impl Future<Output = Option<Account>> + Send;
    /// Stores the aggregate at version + 1, or refuses it with a concurrency conflict (ADR 8).
    fn save(&self, account: &Account) -> impl Future<Output = DomainResult> + Send;
}
