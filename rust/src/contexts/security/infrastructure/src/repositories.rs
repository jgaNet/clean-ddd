//! The repository port on the in-memory store, with the same version rule as every repository
//! of the reference: version + 1 on save, a conflict for a stale aggregate (ADR 8).

use std::sync::Arc;

use architecture_domain::{DomainResult, Entity, Exception};
use architecture_infrastructure::InMemoryDataSource;
use security_domain::account::account_exceptions::SERVICE;
use security_domain::account::ports::account_repository::AccountRepository;
use security_domain::account::{Account, AccountSnapshot};

pub struct InMemoryAccountRepository {
    store: Arc<InMemoryDataSource<AccountSnapshot>>,
}

impl InMemoryAccountRepository {
    pub fn new(store: Arc<InMemoryDataSource<AccountSnapshot>>) -> Self {
        Self { store }
    }
}

impl AccountRepository for InMemoryAccountRepository {
    async fn find_by_id(&self, id: &str) -> Option<Account> {
        self.store.get(id).map(Account::from_snapshot)
    }

    async fn find_by_email(&self, email: &str) -> Option<Account> {
        self.store.all().into_iter().find(|account| account.email == email).map(Account::from_snapshot)
    }

    async fn save(&self, account: &Account) -> DomainResult {
        let id = account.id().value();
        if let Some(stored) = self.store.get(id)
            && stored.version != account.version()
        {
            return Err(Exception::concurrency_conflict(SERVICE, "The account changed since it was read")
                .with("accountId", id)
                .with("read", account.version())
                .with("stored", stored.version));
        }
        let mut snapshot = account.to_snapshot();
        snapshot.version = account.version() + 1;
        self.store.set(id, snapshot);
        Ok(())
    }
}
