"""The roles every context agrees on. A value the outside sends as a string reaches the domain
as a string; ``Role.parse()`` is the type guard that turns it into the enum, never a controller."""

from enum import StrEnum


class Role(StrEnum):
    ADMIN = "ADMIN"
    USER = "USER"
    GUEST = "GUEST"

    @staticmethod
    def parse(value: object) -> "Role | None":
        """The type guard: a string that names a role, or nothing."""
        return next((role for role in Role if role.value == value), None)
