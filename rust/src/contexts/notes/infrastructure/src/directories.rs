//! Notes' view of Security's accounts: an adapter over Security's *read model*, never its
//! aggregate or repository. Only the Notes infrastructure knows the two contexts are in the
//! same process; the domain and application layers of Notes see `AccountDirectory` alone. In
//! separate deployments this file would call Security's API and nothing above it would change.

use std::sync::Arc;

use notes_domain::note::ports::account_directory::AccountDirectory;
use security_domain::account::AccountStatus;
use security_domain::account::ports::account_queries::AccountQueries;

pub struct SecurityAccountDirectory<Q> {
    accounts: Arc<Q>,
}

impl<Q> SecurityAccountDirectory<Q> {
    pub fn new(accounts: Arc<Q>) -> Self {
        Self { accounts }
    }
}

impl<Q: AccountQueries + Send + Sync> AccountDirectory for SecurityAccountDirectory<Q> {
    async fn exists(&self, account_id: &str) -> bool {
        self.accounts.find_by_id(account_id).await.is_some_and(|account| account.status == AccountStatus::Active)
    }
}
