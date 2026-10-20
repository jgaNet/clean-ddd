"""The lifecycle of an account. A self-registered account starts PENDING until its email is
validated; an account registered by an administrator starts ACTIVE. Only an ACTIVE account can
authenticate. The transitions are enforced by the Account aggregate."""

from enum import StrEnum


class AccountStatus(StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
