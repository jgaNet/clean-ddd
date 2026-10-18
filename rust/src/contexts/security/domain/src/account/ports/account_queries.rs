//! Read model of an account: what a screen or an API may show. Never the credentials.

use std::future::Future;
use std::time::SystemTime;

use shared_kernel_domain::Role;

use super::super::account_status::AccountStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountDetail {
    pub id: String,
    pub email: String,
    pub role: Role,
    pub status: AccountStatus,
    pub last_authenticated_at: Option<SystemTime>,
}

pub trait AccountQueries {
    fn find_by_id(&self, id: &str) -> impl Future<Output = Option<AccountDetail>> + Send;
}
