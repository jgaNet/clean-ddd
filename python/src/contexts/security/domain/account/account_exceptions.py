"""Domain exceptions of the Account aggregate: a broken business rule, in business words. They
are carried by ``Failure``, never raised. One file per aggregate; the ``type`` is the PascalCase
name of the rule, as a client reads it on the operation."""

from typing import Any

from architecture.domain.exception import DomainException

SERVICE = "Security"


class AccountDomainException(DomainException):
    def __init__(self, type: str, message: str, context: dict[str, Any] | None = None) -> None:  # noqa: A002
        super().__init__(service=SERVICE, type=type, message=message, context=context or {})


class AccountAlreadyExistsException(AccountDomainException):
    def __init__(self, email: str) -> None:
        super().__init__("AccountAlreadyExists", "An account already exists for this email", {"email": email})


class AccountNotFoundException(AccountDomainException):
    def __init__(self, account_id: str) -> None:
        super().__init__("AccountNotFound", "Account not found", {"accountId": account_id})


class AccountAlreadyActiveException(AccountDomainException):
    def __init__(self, account_id: str) -> None:
        super().__init__("AccountAlreadyActive", "This account is already active", {"accountId": account_id})


class InactiveAccountException(AccountDomainException):
    def __init__(self, account_id: str) -> None:
        super().__init__("InactiveAccount", "This account is not active", {"accountId": account_id})


class InvalidCredentialsException(AccountDomainException):
    """Deliberately vague: it does not say whether the email or the password was wrong."""

    def __init__(self) -> None:
        super().__init__("InvalidCredentials", "Invalid credentials")
