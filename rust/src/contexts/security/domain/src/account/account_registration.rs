//! `AccountRegistration` is a domain service: it holds a business rule that no single aggregate
//! can enforce on its own. "An email identifies at most one account" is a statement about the
//! whole collection of accounts, so it needs the repository. It is still domain code: it
//! depends on the port, not on any implementation, and it carries no application concern (no
//! logging, no transaction, no event publishing).

use std::sync::Arc;

use architecture_domain::DomainResult;
use shared_kernel_domain::Email;

use super::Account;
use super::account_exceptions::account_already_exists;
use super::dtos::NewAccount;
use super::ports::account_repository::AccountRepository;

pub struct AccountRegistration<R> {
    accounts: Arc<R>,
}

impl<R: AccountRepository> AccountRegistration<R> {
    pub fn new(accounts: Arc<R>) -> Self {
        Self { accounts }
    }

    pub async fn register(&self, props: NewAccount) -> DomainResult<Account> {
        let email = Email::create(&props.email)?;
        if self.accounts.find_by_email(email.value()).await.is_some() {
            return Err(account_already_exists(email.value()));
        }
        Account::register(props)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use architecture_domain::Entity;
    use shared_kernel_domain::Role;

    use super::super::account_exceptions::ACCOUNT_ALREADY_EXISTS;
    use super::*;

    /// A domain test needs only the port: a list of snapshots is a repository.
    #[derive(Default)]
    struct Accounts(Mutex<Vec<super::super::AccountSnapshot>>);
    impl AccountRepository for Accounts {
        async fn find_by_id(&self, id: &str) -> Option<Account> {
            self.0.lock().unwrap().iter().find(|a| a.id == id).cloned().map(Account::from_snapshot)
        }
        async fn find_by_email(&self, email: &str) -> Option<Account> {
            self.0.lock().unwrap().iter().find(|a| a.email == email).cloned().map(Account::from_snapshot)
        }
        async fn save(&self, account: &Account) -> DomainResult {
            self.0.lock().unwrap().push(account.to_snapshot());
            Ok(())
        }
    }

    fn alice() -> NewAccount {
        NewAccount {
            email: "alice@example.com".into(),
            role: Role::User,
            password_hash: "hash".into(),
            activated: false,
        }
    }

    #[test]
    fn registers_an_account_whose_email_is_new_and_refuses_a_second_one() {
        let accounts = Arc::new(Accounts::default());
        let registration = AccountRegistration::new(accounts.clone());

        let first = pollster::block_on(registration.register(alice())).expect("registered");
        pollster::block_on(accounts.save(&first)).expect("saved");
        let second =
            pollster::block_on(registration.register(NewAccount { email: "ALICE@example.com".into(), ..alice() }));

        assert_eq!(first.email().value(), "alice@example.com");
        assert!(second.expect_err("same email").is(ACCOUNT_ALREADY_EXISTS));
        assert!(pollster::block_on(accounts.find_by_id(first.id().value())).is_some());
    }
}
