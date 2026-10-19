"""The wiring of the Security context: the handlers bound to their adapters and listed in a
``Module``, plus what the context exposes to the composition root and the other contexts: the
account queries (Notes' directory is an adapter over them), the token service, the
authentication middleware, and the seed of the administrator."""

from dataclasses import dataclass
from datetime import timedelta

from architecture.application.event_bus import EventBus
from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.module import Module, Subscription
from architecture.domain.id import Id
from architecture.domain.result import Result
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.security.application.commands.login import LoginCommandEvent, LoginCommandHandler
from contexts.security.application.commands.register_admin import RegisterAdminCommandEvent, RegisterAdminCommandHandler
from contexts.security.application.commands.sign_up import SignUpCommandEvent, SignUpCommandHandler
from contexts.security.application.commands.validate_account import (
    ValidateAccountCommandEvent,
    ValidateAccountCommandHandler,
)
from contexts.security.application.events.account_created_handler import AccountCreatedHandler
from contexts.security.application.events.account_validated_handler import AccountValidatedHandler
from contexts.security.application.queries.get_account import GetAccountQueryHandler
from contexts.security.domain.account.account_registration import AccountRegistration
from contexts.security.domain.account.dtos import AccountSnapshot
from contexts.security.domain.account.events import AccountCreatedEvent, AccountValidatedEvent
from contexts.security.infrastructure.password_hasher import BcryptPasswordHasher
from contexts.security.infrastructure.queries import InMemoryAccountQueries
from contexts.security.infrastructure.repositories import InMemoryAccountRepository
from contexts.security.infrastructure.signed_tokens import JwtSignedTokens
from contexts.security.presentation.authentication import Authentication
from shared_kernel.domain.role import Role

AccountStore = InMemoryDataSource[AccountSnapshot]


def account_store() -> AccountStore:
    return InMemoryDataSource()


@dataclass(frozen=True)
class SecuritySettings:
    jwt_secret: str
    jwt_expires_in: timedelta
    bcrypt_cost: int


class SecurityWiring:
    """The module, and what the composition root needs beside it."""

    def __init__(self, store: AccountStore, settings: SecuritySettings) -> None:
        repository = InMemoryAccountRepository(store)
        self.account_queries = InMemoryAccountQueries(store)
        self.signed_tokens = JwtSignedTokens(secret=settings.jwt_secret, expires_in=settings.jwt_expires_in)
        self.authentication = Authentication(self.account_queries, self.signed_tokens)
        registration = AccountRegistration(repository)
        hasher = BcryptPasswordHasher(settings.bcrypt_cost)
        self._register_admin = RegisterAdminCommandHandler(repository, registration, hasher)

        self.module = Module(
            name="Security",
            commands=[
                Subscription(SignUpCommandEvent, [SignUpCommandHandler(repository, registration, hasher)]),
                Subscription(LoginCommandEvent, [LoginCommandHandler(repository, hasher, self.signed_tokens)]),
                Subscription(
                    ValidateAccountCommandEvent, [ValidateAccountCommandHandler(repository, self.signed_tokens)]
                ),
            ],
            queries=[GetAccountQueryHandler(self.account_queries)],
            domain_events=[
                Subscription(AccountCreatedEvent, [AccountCreatedHandler(self.signed_tokens)]),
                Subscription(AccountValidatedEvent, [AccountValidatedHandler()]),
            ],
        )

    async def register_admin(self, email: str, password: str, event_bus: EventBus) -> Result[str]:
        """Seeds the administrator at startup. Runs the command on behalf of the system, on the
        application's bus: the seed is an operation like any other, recorded by the Tracker."""
        context = ExecutionContext(
            trace_id=Id.generate().value, event_bus=event_bus, auth=Auth(subject_id="system", role=Role.ADMIN)
        )
        return await self._register_admin.run(RegisterAdminCommandEvent(email=email, password=password), context)


def local_security_module(store: AccountStore, settings: SecuritySettings) -> SecurityWiring:
    return SecurityWiring(store, settings)
