"""The SignedTokens port as HS256 JSON Web Tokens signed with a shared secret (PyJWT). ``verify``
answers nothing for a bad signature, a tampered payload or an expired token. A token is issued at
the application's now (DOMAIN-ONE-CLOCK); its expiry is checked by PyJWT, which decides no
business time."""

from datetime import timedelta

import jwt

from architecture.application.clock import Clock
from contexts.security.domain.auth.ports.signed_tokens import TokenPayload

ALGORITHM = "HS256"


class JwtSignedTokens:
    def __init__(self, *, secret: str, expires_in: timedelta, clock: Clock) -> None:
        self._secret = secret
        self._expires_in = expires_in
        self._clock = clock

    async def issue(self, payload: TokenPayload) -> str:
        now = self._clock()
        claims = {
            "subjectId": payload.subject_id,
            "subjectType": payload.subject_type,
            "iat": now,
            "exp": now + self._expires_in,
        }
        return jwt.encode(claims, self._secret, algorithm=ALGORITHM)

    async def verify(self, token: str) -> TokenPayload | None:
        try:
            claims = jwt.decode(token, self._secret, algorithms=[ALGORITHM])
        except jwt.PyJWTError:
            return None
        subject_id, subject_type = claims.get("subjectId"), claims.get("subjectType")
        if not isinstance(subject_id, str) or not isinstance(subject_type, str):
            return None
        return TokenPayload(subject_id=subject_id, subject_type=subject_type)
