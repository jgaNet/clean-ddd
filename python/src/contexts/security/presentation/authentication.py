"""Identifies the caller of every request. It never blocks: a missing or bad token simply makes
the request anonymous (GUEST), and each handler's guard decides what a guest may do. A token is
accepted only if its signature and expiry check out (SignedTokens.verify), the account still
exists and is active, and the role it claims is the account's current role.

The composition root installs ``authenticating(authentication)`` as a middleware over every
route; the ``Auth`` it establishes travels on ``request.state`` to the middleware that builds
the execution context.
"""

from collections.abc import Awaitable, Callable, Mapping

from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from architecture.application.execution_context import Auth
from contexts.security.domain.account.account_status import AccountStatus
from contexts.security.domain.account.ports.account_queries import AccountQueries
from contexts.security.domain.auth.ports.signed_tokens import SignedTokens
from shared_kernel.domain.role import Role

GUEST = Auth(subject_id=None, role=Role.GUEST)


class Authentication:
    def __init__(self, accounts: AccountQueries, tokens: SignedTokens) -> None:
        self._accounts = accounts
        self._tokens = tokens

    async def identify(self, headers: Mapping[str, str], query_token: str | None = None) -> Auth:
        """Who is behind a request, from its headers and its query string: the account its token
        names, or nobody."""
        token = token_from_cookie(headers) or token_from_header(headers) or query_token
        if not token:
            return GUEST
        claims = await self._tokens.verify(token)
        if claims is None:
            return GUEST
        role = Role.parse(claims.subject_type)
        if role is None:  # a validation token does not sign anyone in
            return GUEST
        account = await self._accounts.find_by_id(claims.subject_id)
        if account is None or account.status is not AccountStatus.ACTIVE or account.role is not role:
            return GUEST
        return Auth(subject_id=account.id, role=role)


Middleware = Callable[[Request, RequestResponseEndpoint], Awaitable[Response]]


def authenticating(authentication: Authentication) -> Middleware:
    """The middleware: ``app.middleware("http")(authenticating(authentication))``."""

    async def authenticate(request: Request, call_next: RequestResponseEndpoint) -> Response:
        request.state.auth = await authentication.identify(request.headers, request.query_params.get("token"))
        return await call_next(request)

    return authenticate


def token_from_header(headers: Mapping[str, str]) -> str | None:
    header = headers.get("authorization", "")
    return header.removeprefix("Bearer ") if header.startswith("Bearer ") else None


def token_from_cookie(headers: Mapping[str, str]) -> str | None:
    for part in headers.get("cookie", "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == "token" and value:
            return value
    return None
