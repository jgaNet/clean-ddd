"""What an account authenticates with. The domain only ever sees a hash: hashing and comparing
are the job of the PasswordHasher port, implemented in the infrastructure. The ``type`` leaves
room for other kinds of credentials without touching the aggregate."""

from dataclasses import dataclass

from architecture.domain.result import Failure, Result, Success
from architecture.domain.value_object import ValueObject
from contexts.security.domain.account.account_exceptions import InvalidCredentialsException


@dataclass(frozen=True, slots=True)
class Credentials(ValueObject[str]):
    """The value is the hash."""

    TYPE = "password"

    @staticmethod
    def create(hash: str) -> Result["Credentials"]:  # noqa: A002
        if not hash:
            return Failure(InvalidCredentialsException())
        return Success(Credentials(hash))

    @property
    def type(self) -> str:
        return Credentials.TYPE

    @property
    def hash(self) -> str:
        return self.value
