from datetime import UTC, datetime

from architecture.domain.result import Failure, Success
from contexts.security.domain.account.account import Account
from contexts.security.domain.account.account_status import AccountStatus
from contexts.security.domain.account.dtos import NewAccount
from contexts.security.domain.account.events import (
    AccountAuthenticatedEvent,
    AccountCreatedEvent,
    AccountValidatedEvent,
)
from shared_kernel.domain.role import Role


def a_pending_account() -> Account:
    account = Account.register(
        NewAccount(email="alice@example.com", role=Role.USER, password_hash="h4sh", activated=False)
    )
    assert isinstance(account, Success)
    account.data.pull_domain_events()
    return account.data


class TestRegistering:
    def test_opens_a_pending_user_account_and_records_account_created(self) -> None:
        result = Account.register(
            NewAccount(email="Alice@Example.com", role=Role.USER, password_hash="h4sh", activated=False)
        )

        assert isinstance(result, Success)
        account = result.data
        assert account.email.value == "alice@example.com"
        assert account.status is AccountStatus.PENDING
        assert account.pull_domain_events() == [
            AccountCreatedEvent(
                account_id=account.id.value, email="alice@example.com", role=Role.USER, status=AccountStatus.PENDING
            )
        ]

    def test_opens_an_administrator_account_that_is_active_at_once(self) -> None:
        account = Account.register(
            NewAccount(email="root@example.com", role=Role.ADMIN, password_hash="h4sh", activated=True)
        )
        assert isinstance(account, Success) and account.data.status is AccountStatus.ACTIVE

    def test_refuses_a_malformed_email_and_empty_credentials(self) -> None:
        malformed = Account.register(
            NewAccount(email="not-an-email", role=Role.USER, password_hash="h", activated=False)
        )
        empty = Account.register(
            NewAccount(email="alice@example.com", role=Role.USER, password_hash="", activated=False)
        )

        assert isinstance(malformed, Failure) and malformed.error.type == "InvalidEmailFormat"
        assert isinstance(empty, Failure) and empty.error.type == "InvalidCredentials"


class TestValidating:
    def test_activates_a_pending_account_and_records_account_validated(self) -> None:
        account = a_pending_account()

        assert account.validate().is_success()
        assert account.status is AccountStatus.ACTIVE
        assert account.pull_domain_events() == [
            AccountValidatedEvent(account_id=account.id.value, email="alice@example.com")
        ]

    def test_cannot_validate_twice(self) -> None:
        account = a_pending_account()
        account.validate()
        twice = account.validate()
        assert isinstance(twice, Failure) and twice.error.type == "AccountAlreadyActive"


class TestAuthenticating:
    def test_records_the_sign_in_of_an_active_account(self) -> None:
        account = a_pending_account()
        account.validate()
        account.pull_domain_events()
        now = datetime(2026, 1, 1, 10, tzinfo=UTC)

        assert account.authenticate(now).is_success()
        assert account.last_authenticated_at == now
        assert account.pull_domain_events() == [AccountAuthenticatedEvent(account_id=account.id.value, at=now)]

    def test_refuses_a_pending_account(self) -> None:
        account = a_pending_account()
        refused = account.authenticate()
        assert isinstance(refused, Failure) and refused.error.type == "InactiveAccount"
        assert account.last_authenticated_at is None


def test_gives_back_an_equal_account_after_the_snapshot_round_trip_without_events() -> None:
    account = a_pending_account()
    account.validate()
    account.authenticate(datetime(2026, 1, 1, 10, tzinfo=UTC))

    rebuilt = Account.from_snapshot(account.to_snapshot())

    assert rebuilt.equals(account)
    assert rebuilt.to_snapshot() == account.to_snapshot()
    assert rebuilt.pull_domain_events() == []
