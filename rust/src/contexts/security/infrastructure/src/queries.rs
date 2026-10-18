//! The read side of the same store. The read model deliberately leaves the credentials behind.

use std::sync::Arc;

use architecture_infrastructure::InMemoryDataSource;
use security_domain::account::AccountSnapshot;
use security_domain::account::ports::account_queries::{AccountDetail, AccountQueries};

pub struct InMemoryAccountQueries {
    store: Arc<InMemoryDataSource<AccountSnapshot>>,
}

impl InMemoryAccountQueries {
    pub fn new(store: Arc<InMemoryDataSource<AccountSnapshot>>) -> Self {
        Self { store }
    }
}

impl AccountQueries for InMemoryAccountQueries {
    async fn find_by_id(&self, id: &str) -> Option<AccountDetail> {
        self.store.get(id).map(|account| AccountDetail {
            id: account.id,
            email: account.email,
            role: account.role,
            status: account.status,
            last_authenticated_at: account.last_authenticated_at,
        })
    }
}
