//! `Account` is the aggregate root of the Security context: who can sign in, and as what.
//!
//! - an account always has a valid email and a set of credentials (value objects)
//! - it is `Pending` until validated, and only an `Active` account can authenticate
//! - the email must be unique across accounts: that rule spans the whole collection, so it
//!   lives in the [`AccountRegistration`] domain service, not here
//!
//! Checking a password against the stored hash is not business: the application layer asks
//! the `PasswordHasher` port, then calls `authenticate()` to record the fact.

pub mod account_exceptions;
pub mod account_registration;
pub mod account_status;
pub mod credentials;
pub mod dtos;
pub mod events;
pub mod ports;

use std::time::SystemTime;

use architecture_domain::{Aggregate, AggregateRoot, DomainResult, Entity, Id};
use shared_kernel_domain::{Email, Role};

pub use account_registration::AccountRegistration;
pub use account_status::AccountStatus;
pub use credentials::Credentials;
pub use dtos::{AccountSnapshot, NewAccount};
pub use events::AccountEvent;

use account_exceptions::{account_already_active, inactive_account};

#[derive(Debug)]
pub struct Account {
    root: AggregateRoot<AccountEvent>,
    email: Email,
    role: Role,
    credentials: Credentials,
    status: AccountStatus,
    last_authenticated_at: Option<SystemTime>,
}

impl Entity for Account {
    fn id(&self) -> &Id {
        self.root.id()
    }
}

impl Aggregate for Account {
    type Event = AccountEvent;

    fn pull_domain_events(&mut self) -> Vec<AccountEvent> {
        self.root.pull_domain_events()
    }
}

impl Account {
    /// Opens a brand new account. Uniqueness of the email is checked by `AccountRegistration`.
    pub fn register(props: NewAccount) -> DomainResult<Account> {
        let email = Email::create(&props.email)?;
        let credentials = Credentials::create(&props.password_hash)?;
        let id = Id::generate();
        let status = if props.activated { AccountStatus::Active } else { AccountStatus::Pending };
        let mut account = Account {
            root: AggregateRoot::new(id.clone(), 0),
            email: email.clone(),
            role: props.role,
            credentials,
            status,
            last_authenticated_at: None,
        };
        account.root.record(AccountEvent::Created {
            account_id: id.value().to_string(),
            email: email.value().to_string(),
            role: props.role,
            status,
        });
        Ok(account)
    }

    /// Rebuilds an `Account` from what was persisted. No event is recorded: nothing new happened.
    ///
    /// # Panics
    ///
    /// On a snapshot that breaks a rule of the aggregate: corrupted storage (ADR 4).
    pub fn from_snapshot(snapshot: AccountSnapshot) -> Account {
        let email = Email::create(&snapshot.email)
            .unwrap_or_else(|refusal| panic!("Corrupted account {}: {}", snapshot.id, refusal.message()));
        let credentials = Credentials::create(&snapshot.credentials_hash)
            .unwrap_or_else(|refusal| panic!("Corrupted account {}: {}", snapshot.id, refusal.message()));
        Account {
            root: AggregateRoot::new(Id::new(snapshot.id), snapshot.version),
            email,
            role: snapshot.role,
            credentials,
            status: snapshot.status,
            last_authenticated_at: snapshot.last_authenticated_at,
        }
    }

    /// Confirms the email address: the account becomes usable.
    pub fn validate(&mut self) -> DomainResult {
        if self.status == AccountStatus::Active {
            return Err(account_already_active(self.id().value()));
        }

        self.status = AccountStatus::Active;
        self.root.record(AccountEvent::Validated {
            account_id: self.id().value().to_string(),
            email: self.email.value().to_string(),
        });
        Ok(())
    }

    /// Records a successful sign-in, now. The caller has already verified the credentials.
    pub fn authenticate(&mut self) -> DomainResult {
        self.authenticate_at(SystemTime::now())
    }

    /// Records a successful sign-in at a given time: time is a parameter, with `authenticate()` as its default.
    pub fn authenticate_at(&mut self, now: SystemTime) -> DomainResult {
        if self.status != AccountStatus::Active {
            return Err(inactive_account(self.id().value()));
        }

        self.last_authenticated_at = Some(now);
        self.root.record(AccountEvent::Authenticated { account_id: self.id().value().to_string(), at: now });
        Ok(())
    }

    pub fn to_snapshot(&self) -> AccountSnapshot {
        AccountSnapshot {
            id: self.id().value().to_string(),
            email: self.email.value().to_string(),
            role: self.role,
            credentials_hash: self.credentials.hash().to_string(),
            status: self.status,
            last_authenticated_at: self.last_authenticated_at,
            version: self.root.version(),
        }
    }

    /// The version this aggregate was read at; the repository stores version + 1 (ADR 8).
    pub fn version(&self) -> u64 {
        self.root.version()
    }

    pub fn email(&self) -> &Email {
        &self.email
    }

    pub fn role(&self) -> Role {
        self.role
    }

    pub fn credentials(&self) -> &Credentials {
        &self.credentials
    }

    pub fn status(&self) -> AccountStatus {
        self.status
    }

    pub fn last_authenticated_at(&self) -> Option<SystemTime> {
        self.last_authenticated_at
    }
}

#[cfg(test)]
mod tests {
    use account_exceptions::{ACCOUNT_ALREADY_ACTIVE, INACTIVE_ACCOUNT, INVALID_CREDENTIALS};
    use shared_kernel_domain::email::INVALID_EMAIL_FORMAT;

    use super::*;

    fn a_new_account(activated: bool) -> NewAccount {
        NewAccount { email: "Alice@Example.com".into(), role: Role::User, password_hash: "hash".into(), activated }
    }

    #[test]
    fn registers_a_pending_account_with_a_normalised_email_and_records_the_fact() {
        let mut account = Account::register(a_new_account(false)).expect("registered");

        assert_eq!(account.email().value(), "alice@example.com");
        assert_eq!(account.status(), AccountStatus::Pending);
        assert_eq!(account.role(), Role::User);
        assert_eq!(account.version(), 0);
        assert_eq!(
            account.pull_domain_events(),
            [AccountEvent::Created {
                account_id: account.id().value().to_string(),
                email: "alice@example.com".into(),
                role: Role::User,
                status: AccountStatus::Pending,
            }]
        );
    }

    #[test]
    fn an_account_an_administrator_opens_is_active_at_once() {
        let account = Account::register(a_new_account(true)).expect("registered");

        assert_eq!(account.status(), AccountStatus::Active);
    }

    #[test]
    fn refuses_a_bad_email_or_empty_credentials() {
        let bad_email = Account::register(NewAccount { email: "nope".into(), ..a_new_account(false) });
        let no_hash = Account::register(NewAccount { password_hash: "".into(), ..a_new_account(false) });

        assert!(bad_email.expect_err("email").is(INVALID_EMAIL_FORMAT));
        assert!(no_hash.expect_err("credentials").is(INVALID_CREDENTIALS));
    }

    #[test]
    fn validates_once_and_only_then_lets_the_account_authenticate() {
        let mut account = Account::register(a_new_account(false)).expect("registered");
        account.pull_domain_events();

        assert!(account.authenticate().expect_err("pending").is(INACTIVE_ACCOUNT));
        account.validate().expect("validated");
        assert!(account.validate().expect_err("twice").is(ACCOUNT_ALREADY_ACTIVE));
        account.authenticate_at(SystemTime::UNIX_EPOCH).expect("authenticated");

        assert_eq!(account.last_authenticated_at(), Some(SystemTime::UNIX_EPOCH));
        assert_eq!(
            account.pull_domain_events(),
            [
                AccountEvent::Validated {
                    account_id: account.id().value().to_string(),
                    email: "alice@example.com".into()
                },
                AccountEvent::Authenticated {
                    account_id: account.id().value().to_string(),
                    at: SystemTime::UNIX_EPOCH
                },
            ]
        );
    }

    #[test]
    fn rebuilds_from_its_snapshot_without_recording_anything() {
        let account = Account::register(a_new_account(true)).expect("registered");
        let snapshot = account.to_snapshot();

        let mut rebuilt = Account::from_snapshot(snapshot.clone());

        assert_eq!(rebuilt.to_snapshot(), snapshot);
        assert!(rebuilt.pull_domain_events().is_empty());
    }

    #[test]
    #[should_panic(expected = "Corrupted account a1")]
    fn panics_on_a_corrupted_snapshot() {
        Account::from_snapshot(AccountSnapshot {
            id: "a1".into(),
            email: "not an email".into(),
            role: Role::User,
            credentials_hash: "hash".into(),
            status: AccountStatus::Active,
            last_authenticated_at: None,
            version: 0,
        });
    }
}
