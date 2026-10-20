"""Signed, expiring tokens that carry a subject and what the token is for (a session for a
role, a validation link). The domain says what a token must carry and that it cannot be forged;
how it is signed (JWT, HS256) is the infrastructure's choice."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class TokenPayload:
    subject_id: str
    #: A role (a session) or a TokenTypes value (a validation link).
    subject_type: str


class SignedTokens(Protocol):
    async def issue(self, payload: TokenPayload) -> str: ...

    async def verify(self, token: str) -> TokenPayload | None:
        """The payload of a token whose signature and expiry check out, None otherwise."""
        ...
