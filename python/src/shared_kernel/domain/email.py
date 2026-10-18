"""Email is a value object: once you hold one you know it is well-formed. Like every value
object in this project it is built through ``create()``, which returns a ``Result`` instead of
raising, so an invalid input is an ordinary failure the caller handles."""

import re
from dataclasses import dataclass

from architecture.domain.exception import DomainException
from architecture.domain.result import Failure, Result, Success
from architecture.domain.value_object import ValueObject

WELL_FORMED = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


class InvalidEmailFormatException(DomainException):
    def __init__(self, raw: str) -> None:
        super().__init__(
            service="unknown", type="InvalidEmailFormat", message="Invalid email format", context={"email": raw}
        )


@dataclass(frozen=True, slots=True)
class Email(ValueObject[str]):
    MAX_LENGTH = 254

    @staticmethod
    def create(raw: str) -> Result["Email"]:
        """Trims, lower-cases, and refuses what is not ``local@domain.tld`` or is too long."""
        email = raw.strip().lower()
        if len(email) > Email.MAX_LENGTH or not WELL_FORMED.match(email):
            return Failure(InvalidEmailFormatException(raw))
        return Success(Email(email))

    @property
    def username(self) -> str:
        """What is before the ``@``."""
        return self.value.split("@", 1)[0]
