"""What a token is for, besides a session for a role: a validation link."""

from enum import StrEnum


class TokenTypes(StrEnum):
    VALIDATION = "VALIDATION"
