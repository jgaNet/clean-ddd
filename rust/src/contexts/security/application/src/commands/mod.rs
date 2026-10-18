//! The commands of the Security context, one file per use case: the command with its `NAME`
//! and its `Output`, and its handler, generic over the ports it takes in `new()`.

pub mod login;
pub mod register_admin;
pub mod sign_up;
pub mod validate_account;

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_application::{
        Auth, CommandHandler, EventBus, EventHandler, EventSubscriber, ExecutionContext, ExecutionContextOptions,
    };
    use architecture_domain::DomainResult;
    use architecture_domain::common_exceptions::NOT_ALLOWED;
    use architecture_infrastructure::{InMemoryDataSource, InMemoryEventBus};
    use security_domain::account::account_exceptions::{
        ACCOUNT_ALREADY_EXISTS, ACCOUNT_NOT_FOUND, INACTIVE_ACCOUNT, INVALID_CREDENTIALS,
    };
    use security_domain::account::ports::account_repository::AccountRepository;
    use security_domain::account::{AccountRegistration, AccountStatus};
    use security_domain::auth::TokenPayload;
    use security_domain::auth::ports::password_hasher::PasswordHasher;
    use security_domain::auth::ports::signed_tokens::SignedTokens;
    use security_infrastructure::repositories::InMemoryAccountRepository;
    use shared_kernel_application::integration_events::account_integration_events::AccountIntegrationEvent;
    use shared_kernel_domain::Role;

    use super::login::{Login, LoginCommandHandler};
    use super::register_admin::{RegisterAdmin, RegisterAdminCommandHandler};
    use super::sign_up::{SignUp, SignUpCommandHandler};
    use super::validate_account::{ValidateAccount, ValidateAccountCommandHandler};

    /// The hasher, made legible: the hash is the password, marked.
    struct Legible;
    impl PasswordHasher for Legible {
        async fn hash(&self, plain: &str) -> String {
            format!("hashed:{plain}")
        }
        async fn compare(&self, plain: &str, hash: &str) -> bool {
            hash == format!("hashed:{plain}")
        }
    }

    /// Tokens nobody signs: the payload, joined. A test reads them back; nothing else should.
    struct Unsigned;
    impl SignedTokens for Unsigned {
        async fn issue(&self, payload: TokenPayload) -> String {
            format!("{}|{}", payload.subject_id, payload.subject_type)
        }
        async fn verify(&self, token: &str) -> Option<TokenPayload> {
            let (subject_id, subject_type) = token.split_once('|')?;
            Some(TokenPayload { subject_id: subject_id.into(), subject_type: subject_type.into() })
        }
    }

    #[derive(Default)]
    struct Published(Mutex<Vec<AccountIntegrationEvent>>);
    impl EventHandler for Published {
        type Event = AccountIntegrationEvent;
        async fn execute(&self, event: AccountIntegrationEvent, _: &ExecutionContext) -> DomainResult {
            self.0.lock().unwrap().push(event);
            Ok(())
        }
    }

    struct Fixture {
        repository: Arc<InMemoryAccountRepository>,
        bus: Arc<InMemoryEventBus>,
        published: Arc<EventSubscriber<Published>>,
    }

    impl Fixture {
        fn new() -> Self {
            let repository = Arc::new(InMemoryAccountRepository::new(Arc::new(InMemoryDataSource::new())));
            let bus = Arc::new(InMemoryEventBus::new());
            let published = Arc::new(EventSubscriber(Published::default()));
            // The reactions of the context, so that a command's consequences are visible here.
            pollster::block_on(bus.subscribe(
                "AccountCreated",
                Arc::new(EventSubscriber(crate::events::AccountCreatedHandler::new(Arc::new(Unsigned)))),
            ));
            pollster::block_on(
                bus.subscribe("AccountValidated", Arc::new(EventSubscriber(crate::events::AccountValidatedHandler))),
            );
            for channel in [AccountIntegrationEvent::CREATED, AccountIntegrationEvent::VALIDATED] {
                pollster::block_on(bus.subscribe(channel, published.clone()));
            }
            Self { repository, bus, published }
        }

        fn context(&self, auth: Auth) -> ExecutionContext {
            ExecutionContext::new(ExecutionContextOptions {
                trace_id: "trace".into(),
                auth,
                event_bus: self.bus.clone(),
                unit_of_work: None,
                logger: None,
            })
        }

        fn sign_up(&self) -> SignUpCommandHandler<InMemoryAccountRepository, Legible> {
            SignUpCommandHandler::new(
                self.repository.clone(),
                AccountRegistration::new(self.repository.clone()),
                Arc::new(Legible),
            )
        }

        fn login(&self) -> LoginCommandHandler<InMemoryAccountRepository, Legible, Unsigned> {
            LoginCommandHandler::new(self.repository.clone(), Arc::new(Legible), Arc::new(Unsigned))
        }

        fn validate(&self) -> ValidateAccountCommandHandler<InMemoryAccountRepository, Unsigned> {
            ValidateAccountCommandHandler::new(self.repository.clone(), Arc::new(Unsigned))
        }

        fn register_admin(&self) -> RegisterAdminCommandHandler<InMemoryAccountRepository, Legible> {
            RegisterAdminCommandHandler::new(
                self.repository.clone(),
                AccountRegistration::new(self.repository.clone()),
                Arc::new(Legible),
            )
        }

        fn signed_up(&self, email: &str, password: &str) -> String {
            pollster::block_on(
                self.sign_up().execute(
                    SignUp { email: email.into(), password: password.into() },
                    &self.context(Auth::anonymous()),
                ),
            )
            .expect("signed up")
        }

        fn published(&self) -> Vec<AccountIntegrationEvent> {
            self.published.0.0.lock().unwrap().clone()
        }
    }

    #[test]
    fn signing_up_opens_a_pending_account_and_sends_its_validation_token_to_the_other_contexts() {
        let fixture = Fixture::new();

        let account_id = fixture.signed_up("alice@example.com", "s3cret");

        let account = pollster::block_on(fixture.repository.find_by_id(&account_id)).expect("stored");
        assert_eq!(account.status(), AccountStatus::Pending);
        assert_eq!(account.credentials().hash(), "hashed:s3cret");
        assert_eq!(
            fixture.published(),
            [AccountIntegrationEvent::Created {
                account_id: account_id.clone(),
                email: "alice@example.com".into(),
                validation_token: format!("{account_id}|VALIDATION"),
            }]
        );
    }

    #[test]
    fn signing_up_twice_with_the_same_email_is_refused_by_the_domain_service() {
        let fixture = Fixture::new();
        fixture.signed_up("alice@example.com", "s3cret");

        let second = pollster::block_on(fixture.sign_up().execute(
            SignUp { email: "Alice@example.com".into(), password: "other".into() },
            &fixture.context(Auth::anonymous()),
        ));

        assert!(second.expect_err("same email").is(ACCOUNT_ALREADY_EXISTS));
    }

    #[test]
    fn logging_in_answers_a_session_token_for_the_right_password_of_an_active_account_only() {
        let fixture = Fixture::new();
        let account_id = fixture.signed_up("alice@example.com", "s3cret");
        let login = |password: &str| {
            pollster::block_on(fixture.login().execute(
                Login { identifier: "alice@example.com".into(), password: password.into() },
                &fixture.context(Auth::anonymous()),
            ))
        };

        assert!(login("s3cret").expect_err("pending").is(INACTIVE_ACCOUNT));
        pollster::block_on(fixture.validate().execute(
            ValidateAccount::ByToken { validation_token: format!("{account_id}|VALIDATION") },
            &fixture.context(Auth::anonymous()),
        ))
        .expect("validated");

        assert_eq!(login("s3cret").expect("logged in").token, format!("{account_id}|USER"));
        assert!(login("wrong").expect_err("wrong password").is(INVALID_CREDENTIALS));
        let unknown = pollster::block_on(fixture.login().execute(
            Login { identifier: "nobody@example.com".into(), password: "s3cret".into() },
            &fixture.context(Auth::anonymous()),
        ));
        assert!(unknown.expect_err("unknown account").is(INVALID_CREDENTIALS));
    }

    #[test]
    fn an_account_is_validated_by_whoever_holds_its_token_or_by_an_administrator_by_id() {
        let fixture = Fixture::new();
        let alice = fixture.signed_up("alice@example.com", "a");
        let bob = fixture.signed_up("bob@example.com", "b");
        let admin = fixture.context(Auth::of("root", Role::Admin.as_str()));
        let anonymous = fixture.context(Auth::anonymous());

        let by_id_anonymously =
            pollster::block_on(fixture.validate().run(ValidateAccount::ById { account_id: alice.clone() }, &anonymous));
        let with_a_session_token = pollster::block_on(
            fixture.validate().run(ValidateAccount::ByToken { validation_token: format!("{alice}|USER") }, &anonymous),
        );
        let by_id_as_admin =
            pollster::block_on(fixture.validate().run(ValidateAccount::ById { account_id: alice.clone() }, &admin));
        let by_token = pollster::block_on(
            fixture
                .validate()
                .run(ValidateAccount::ByToken { validation_token: format!("{bob}|VALIDATION") }, &anonymous),
        );
        let unknown =
            pollster::block_on(fixture.validate().run(ValidateAccount::ById { account_id: "nobody".into() }, &admin));

        assert!(by_id_anonymously.expect_err("anonymous by id").is(NOT_ALLOWED));
        assert!(with_a_session_token.expect_err("a session token validates nothing").is(NOT_ALLOWED));
        assert_eq!(by_id_as_admin.expect("admin"), alice);
        assert_eq!(by_token.expect("token"), bob);
        assert!(unknown.expect_err("unknown").is(ACCOUNT_NOT_FOUND));
        assert_eq!(
            fixture.published().iter().filter(|e| matches!(e, AccountIntegrationEvent::Validated { .. })).count(),
            2
        );
    }

    #[test]
    fn only_an_administrator_registers_another_one_and_that_account_is_active_at_once() {
        let fixture = Fixture::new();
        let command = || RegisterAdmin { email: "root2@example.com".into(), password: "r".into() };

        let as_user =
            pollster::block_on(fixture.register_admin().run(command(), &fixture.context(Auth::of("u", "USER"))));
        let as_admin =
            pollster::block_on(fixture.register_admin().run(command(), &fixture.context(Auth::of("a", "ADMIN"))));

        assert!(as_user.expect_err("users may not").is(NOT_ALLOWED));
        let account =
            pollster::block_on(fixture.repository.find_by_id(&as_admin.expect("registered"))).expect("stored");
        assert_eq!((account.role(), account.status()), (Role::Admin, AccountStatus::Active));
        assert!(fixture.published().is_empty()); // nothing to validate, nothing to tell
    }
}
