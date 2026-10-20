import base64
import json
from datetime import timedelta

from contexts.security.domain.auth.ports.signed_tokens import TokenPayload
from contexts.security.infrastructure.signed_tokens import JwtSignedTokens

SECRET = "test-secret-of-at-least-thirty-two-bytes"
service = JwtSignedTokens(secret=SECRET, expires_in=timedelta(hours=1))
alice = TokenPayload(subject_id="account-1", subject_type="USER")


async def test_issues_a_token_and_verifies_it_back() -> None:
    assert await service.verify(await service.issue(alice)) == alice


async def test_rejects_a_token_signed_with_another_secret() -> None:
    other = JwtSignedTokens(secret="other-secret-of-at-least-thirty-two-bytes", expires_in=timedelta(hours=1))
    assert await service.verify(await other.issue(alice)) is None


async def test_rejects_a_tampered_token() -> None:
    header, _, signature = (await service.issue(alice)).split(".")
    forged = json.dumps({"subjectId": "account-1", "subjectType": "ADMIN"}).encode()
    payload = base64.urlsafe_b64encode(forged).decode().rstrip("=")
    assert await service.verify(f"{header}.{payload}.{signature}") is None


async def test_rejects_an_expired_token() -> None:
    expired = JwtSignedTokens(secret=SECRET, expires_in=timedelta(seconds=-1))
    assert await service.verify(await expired.issue(alice)) is None
