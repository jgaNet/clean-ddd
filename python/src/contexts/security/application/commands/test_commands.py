"""The handlers of the Account aggregate, through ``execute()``; RegisterAdmin's rule is in
``guard()``, which only ``handle()`` runs, so its cases go through an operation, as the bus
would. The password hasher is a reversible fake, so the tests can read what was "hashed"."""

from datetime import timedelta
from typing import Any

import pytest

from architecture.application.execution_context import Auth, ExecutionContext
from architecture.application.operation import Operation, OperationStatus
from architecture.domain.event import Event
from architecture.domain.result import Failure, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.security.application.commands.login import LoginCommandEvent, LoginCommandHandler
from contexts.security.application.commands.register_admin import RegisterAdminCommandEvent, RegisterAdminCommandHandler
from contexts.security.application.commands.sign_up import SignUpCommandEvent, SignUpCommandHandler
from contexts.security.application.commands.validate_account import (
    ValidateAccountCommandEvent,
    ValidateAccountCommandHandler,
)
from contexts.security.domain.account.account import Account
from contexts.security.domain.account.account_registration import AccountRegistration
from contexts.security.domain.account.account_status import AccountStatus
from contexts.security.domain.account.dtos import AccountSnapshot, CredentialsSnapshot, NewAccount
from contexts.security.domain.account.events import AccountAuthenticatedEvent, AccountCreatedEvent
from contexts.security.domain.auth.ports.signed_tokens import TokenPayload
from contexts.security.domain.auth.token_types import TokenTypes
from contexts.security.infrastructure.repositories import InMemoryAccountRepository
from contexts.security.infrastructure.signed_tokens import JwtSignedTokens
from shared_kernel.domain.role import Role


class FakeHasher:
    async def hash(self, plain: str) -> str:
        return f"hashed({plain})"

    async def compare(self, plain: str, hash: str) -> bool:  # noqa: A002
        return hash == f"hashed({plain})"


class RecordingBus:
    def __init__(self) -> None:
        self.published: list[Event] = []

    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext) -> Operation[E]:
        self.published.append(event)
        return Operation(event, context)

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


class Fixture:
    def __init__(self) -> None:
        self.store: InMemoryDataSource[AccountSnapshot] = InMemoryDataSource()
        self.repository = InMemoryAccountRepository(self.store)
        self.registration = AccountRegistration(self.repository)
        self.hasher = FakeHasher()
        self.tokens = JwtSignedTokens(secret="test-secret-of-at-least-thirty-two-bytes", expires_in=timedelta(hours=1))
        self.bus = RecordingBus()

    def context_for(self, role: Role, subject_id: str | None = None) -> ExecutionContext:
        return ExecutionContext(trace_id="trace", event_bus=self.bus, auth=Auth(subject_id=subject_id, role=role))

    async def an_account(self, email: str, *, activated: bool) -> str:
        account = Account.register(
            NewAccount(email=email, role=Role.USER, password_hash="hashed(secret)", activated=activated)
        )
        assert isinstance(account, Success)
        await self.repository.save(account.data)
        return account.data.id.value


@pytest.fixture
def security() -> Fixture:
    return Fixture()


class TestSignUp:
    async def test_saves_a_pending_user_account_with_a_hashed_password_and_publishes_account_created(
        self, security: Fixture
    ) -> None:
        handler = SignUpCommandHandler(security.repository, security.registration, security.hasher)
        result = await handler.execute(
            SignUpCommandEvent(email="user@user.fr", password="secret"), security.context_for(Role.GUEST)
        )

        assert isinstance(result, Success)
        account_id = result.data
        assert security.store.collection[account_id] == AccountSnapshot(
            id=account_id,
            email="user@user.fr",
            role=Role.USER,
            credentials=CredentialsSnapshot(type="password", hash="hashed(secret)"),
            status=AccountStatus.PENDING,
        )
        assert security.bus.published == [
            AccountCreatedEvent(
                account_id=account_id, email="user@user.fr", role=Role.USER, status=AccountStatus.PENDING
            )
        ]

    async def test_refuses_a_malformed_email_and_saves_nothing(self, security: Fixture) -> None:
        handler = SignUpCommandHandler(security.repository, security.registration, security.hasher)
        result = await handler.execute(
            SignUpCommandEvent(email="simple-nickname", password="secret"), security.context_for(Role.GUEST)
        )
        assert isinstance(result, Failure) and result.error.type == "InvalidEmailFormat"
        assert security.store.collection == {}
        assert security.bus.published == []

    async def test_refuses_an_email_that_already_has_an_account(self, security: Fixture) -> None:
        handler = SignUpCommandHandler(security.repository, security.registration, security.hasher)
        await handler.execute(
            SignUpCommandEvent(email="user@user.fr", password="secret"), security.context_for(Role.GUEST)
        )

        result = await handler.execute(
            SignUpCommandEvent(email="user@user.fr", password="other"), security.context_for(Role.GUEST)
        )
        assert isinstance(result, Failure) and result.error.type == "AccountAlreadyExists"
        assert len(security.store.collection) == 1


class TestLogin:
    async def test_signs_in_an_active_account_with_the_right_password_and_publishes_account_authenticated(
        self, security: Fixture
    ) -> None:
        alice_id = await security.an_account("alice@example.com", activated=True)
        handler = LoginCommandHandler(security.repository, security.hasher, security.tokens)

        result = await handler.execute(
            LoginCommandEvent(identifier="alice@example.com", password="secret"), security.context_for(Role.GUEST)
        )

        assert isinstance(result, Success)
        assert await security.tokens.verify(result.data) == TokenPayload(subject_id=alice_id, subject_type="USER")
        assert security.store.collection[alice_id].last_authenticated_at is not None
        assert [type(e) for e in security.bus.published] == [AccountAuthenticatedEvent]

    async def test_refuses_an_unknown_email_and_a_wrong_password_with_the_same_vague_answer(
        self, security: Fixture
    ) -> None:
        await security.an_account("alice@example.com", activated=True)
        handler = LoginCommandHandler(security.repository, security.hasher, security.tokens)

        unknown = await handler.execute(
            LoginCommandEvent(identifier="nobody@example.com", password="secret"), security.context_for(Role.GUEST)
        )
        wrong = await handler.execute(
            LoginCommandEvent(identifier="alice@example.com", password="nope"), security.context_for(Role.GUEST)
        )

        assert isinstance(unknown, Failure) and isinstance(wrong, Failure)
        assert unknown.error == wrong.error and unknown.error.type == "InvalidCredentials"
        assert security.bus.published == []

    async def test_refuses_a_pending_account_even_with_the_right_password(self, security: Fixture) -> None:
        await security.an_account("pending@example.com", activated=False)
        handler = LoginCommandHandler(security.repository, security.hasher, security.tokens)

        result = await handler.execute(
            LoginCommandEvent(identifier="pending@example.com", password="secret"), security.context_for(Role.GUEST)
        )
        assert isinstance(result, Failure) and result.error.type == "InactiveAccount"


class TestValidateAccount:
    async def test_validates_with_the_validation_token_emailed_at_sign_up_whoever_presents_it(
        self, security: Fixture
    ) -> None:
        pending_id = await security.an_account("eve@example.com", activated=False)
        token = await security.tokens.issue(TokenPayload(subject_id=pending_id, subject_type=TokenTypes.VALIDATION))

        result = await ValidateAccountCommandHandler(security.repository, security.tokens).execute(
            ValidateAccountCommandEvent(validation_token=token), security.context_for(Role.GUEST)
        )

        assert isinstance(result, Success)
        assert security.store.collection[pending_id].status is AccountStatus.ACTIVE

    async def test_validates_by_id_for_an_administrator(self, security: Fixture) -> None:
        pending_id = await security.an_account("eve@example.com", activated=False)

        result = await ValidateAccountCommandHandler(security.repository, security.tokens).execute(
            ValidateAccountCommandEvent(account_id=pending_id), security.context_for(Role.ADMIN, "root")
        )

        assert isinstance(result, Success)
        assert security.store.collection[pending_id].status is AccountStatus.ACTIVE

    async def test_refuses_validation_by_id_from_anyone_else_whatever_the_payload_says(self, security: Fixture) -> None:
        pending_id = await security.an_account("eve@example.com", activated=False)
        handler = ValidateAccountCommandHandler(security.repository, security.tokens)

        for context in (security.context_for(Role.GUEST), security.context_for(Role.USER, "someone")):
            result = await handler.execute(ValidateAccountCommandEvent(account_id=pending_id), context)
            assert isinstance(result, Failure) and result.error.type == "NotAllowed"
        assert security.store.collection[pending_id].status is AccountStatus.PENDING

    async def test_refuses_a_login_token_presented_as_a_validation_token(self, security: Fixture) -> None:
        pending_id = await security.an_account("eve@example.com", activated=False)
        login_token = await security.tokens.issue(TokenPayload(subject_id=pending_id, subject_type=Role.USER))

        result = await ValidateAccountCommandHandler(security.repository, security.tokens).execute(
            ValidateAccountCommandEvent(validation_token=login_token), security.context_for(Role.GUEST)
        )

        assert isinstance(result, Failure) and result.error.type == "NotAllowed"
        assert security.store.collection[pending_id].status is AccountStatus.PENDING


class TestRegisterAdmin:
    """The rule is in guard(), which only handle() runs: through an operation, as the bus would."""

    async def register(self, security: Fixture, role: Role) -> Operation[RegisterAdminCommandEvent]:
        handler = RegisterAdminCommandHandler(security.repository, security.registration, security.hasher)
        command = RegisterAdminCommandEvent(email="root@example.com", password="secret")
        return await handler.handle(Operation(command, security.context_for(role, "caller")))

    async def test_lets_an_administrator_open_an_account_that_is_active_at_once(self, security: Fixture) -> None:
        operation = await self.register(security, Role.ADMIN)

        assert operation.status is OperationStatus.SUCCESS
        assert isinstance(operation.result, Success)
        stored = security.store.collection[operation.result.data]
        assert (stored.role, stored.status) == (Role.ADMIN, AccountStatus.ACTIVE)

    async def test_refuses_anyone_else_before_touching_the_store(self, security: Fixture) -> None:
        operation = await self.register(security, Role.USER)

        assert operation.status is OperationStatus.ERROR
        assert isinstance(operation.result, Failure) and operation.result.error.type == "NotAllowed"
        assert security.store.collection == {}
