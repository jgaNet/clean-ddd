//! The wiring of the Security context: the one place its handlers are bound to its adapters
//! and listed in a `Module`. What it exports besides the module — the account read model (for
//! Notes' directory adapter), the authentication layer and the seed of the administrator — are
//! the fields of [`LocalSecurity`], public items of this crate and nothing more (ARCH-MODULES-DATA).

use std::sync::Arc;
use std::time::Duration;

use architecture_application::{
    Auth, CommandHandler, EventBus, ExecutionContext, ExecutionContextOptions, Module, ModuleDefinition, Subscription,
    query,
};
use architecture_domain::{DomainResult, Id};
use architecture_infrastructure::InMemoryDataSource;
use security_application::commands::login::LoginCommandHandler;
use security_application::commands::register_admin::{RegisterAdmin, RegisterAdminCommandHandler};
use security_application::commands::sign_up::SignUpCommandHandler;
use security_application::commands::validate_account::ValidateAccountCommandHandler;
use security_application::events::{AccountCreatedHandler, AccountValidatedHandler};
use security_application::queries::get_account::GetAccountQueryHandler;
use security_domain::account::{AccountRegistration, AccountSnapshot};
use security_infrastructure::{
    BcryptPasswordHasher, InMemoryAccountQueries, InMemoryAccountRepository, JwtSignedTokens,
};
use security_presentation::{Authentication, Identify};
use shared_kernel_domain::Role;

/// What the composition root decides for this context, from its settings.
pub struct SecuritySettings {
    pub jwt_secret: String,
    pub jwt_expires_in: Duration,
    /// bcrypt's cost; low in the tests, which hash a few passwords per suite.
    pub bcrypt_cost: u32,
}

/// The context's store, which the composition root hands to the unit of work.
pub type AccountStore = Arc<InMemoryDataSource<AccountSnapshot>>;

pub fn account_store() -> AccountStore {
    Arc::new(InMemoryDataSource::new())
}

/// The Security context, wired for the local environment.
pub struct LocalSecurity {
    pub module: Arc<Module>,
    /// Security's read model, which another context's adapter may read (never its aggregate).
    pub account_queries: Arc<InMemoryAccountQueries>,
    /// What identifies the caller of every request, for the authentication layer.
    pub authentication: Arc<dyn Identify>,
    register_admin: RegisterAdminCommandHandler<InMemoryAccountRepository, BcryptPasswordHasher>,
}

pub fn local_security_module(store: &AccountStore, settings: &SecuritySettings) -> LocalSecurity {
    let repository = Arc::new(InMemoryAccountRepository::new(store.clone()));
    let account_queries = Arc::new(InMemoryAccountQueries::new(store.clone()));
    let hasher = Arc::new(BcryptPasswordHasher::new(settings.bcrypt_cost));
    let tokens = Arc::new(JwtSignedTokens::new(&settings.jwt_secret, settings.jwt_expires_in));
    let registration = || AccountRegistration::new(repository.clone());

    let module = Module::new(ModuleDefinition {
        name: "Security",
        commands: vec![
            Subscription::command(SignUpCommandHandler::new(repository.clone(), registration(), hasher.clone())),
            Subscription::command(LoginCommandHandler::new(repository.clone(), hasher.clone(), tokens.clone())),
            Subscription::command(ValidateAccountCommandHandler::new(repository.clone(), tokens.clone())),
        ],
        queries: vec![query(GetAccountQueryHandler::new(account_queries.clone()))],
        domain_events: vec![
            Subscription::reaction("AccountCreated", AccountCreatedHandler::new(tokens.clone())),
            Subscription::reaction("AccountValidated", AccountValidatedHandler),
        ],
        integration_events: vec![],
    });

    LocalSecurity {
        module: Arc::new(module),
        authentication: Arc::new(Authentication::new(account_queries.clone(), tokens)),
        account_queries,
        register_admin: RegisterAdminCommandHandler::new(repository.clone(), registration(), hasher),
    }
}

impl LocalSecurity {
    /// Seeds the administrator at startup. Runs the command on behalf of the system, on the
    /// application's bus: the seed's events are published like any other command's.
    pub async fn register_admin(&self, email: &str, password: &str, bus: Arc<dyn EventBus>) -> DomainResult<String> {
        let context = ExecutionContext::new(ExecutionContextOptions {
            trace_id: Id::generate().value().to_string(),
            auth: Auth::of("system", Role::Admin.as_str()),
            event_bus: bus,
            unit_of_work: None,
            logger: None,
        });
        self.register_admin.run(RegisterAdmin { email: email.into(), password: password.into() }, &context).await
    }
}
