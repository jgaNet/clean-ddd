//! One account, as its owner or an administrator may see it. The rule is about the caller, not
//! the rows, so it is a `guard()`; a guest is refused before anything is read.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Query, QueryHandler};
use architecture_domain::{DomainResult, Exception};
use security_domain::account::ports::account_queries::{AccountDetail, AccountQueries};
use shared_kernel_domain::Role;

use crate::SERVICE;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GetAccount {
    pub id: String,
}

impl Query for GetAccount {
    type Output = AccountDetail;
}

pub struct GetAccountQueryHandler<Q> {
    queries: Arc<Q>,
}

impl<Q> GetAccountQueryHandler<Q> {
    pub fn new(queries: Arc<Q>) -> Self {
        Self { queries }
    }
}

impl<Q: AccountQueries + Send + Sync + 'static> QueryHandler for GetAccountQueryHandler<Q> {
    type Query = GetAccount;

    async fn guard(&self, query: &GetAccount, context: &ExecutionContext) -> DomainResult {
        let auth = context.auth();
        match auth.role.as_deref().and_then(Role::parse) {
            None | Some(Role::Guest) => Err(Exception::not_allowed(SERVICE, "Authentication required")),
            Some(Role::User) if auth.subject_id.as_deref() != Some(query.id.as_str()) => {
                Err(Exception::not_allowed(SERVICE, "Not Allowed"))
            }
            _ => Ok(()),
        }
    }

    async fn execute(&self, GetAccount { id }: GetAccount, _: &ExecutionContext) -> DomainResult<AccountDetail> {
        self.queries.find_by_id(&id).await.ok_or_else(|| Exception::not_found(SERVICE, "Account not found"))
    }
}
