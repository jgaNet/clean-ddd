"""Identifies the caller of every request. It never blocks: a missing or bad token simply makes
the request anonymous (GUEST), and each handler's guard decides what a guest may do. A token is
accepted only if its signature and expiry check out (SignedTokens.verify), the account still
exists and is active, and the role it claims is the account's current role.

The composition root gives ``Authentication.authenticate`` to the transport, which asks it on
every HTTP request and every websocket connection, before anything else runs; the ``Auth`` it
answers travels on the connection's state (``request.state.auth``, ``websocket.state.auth``) to
the middleware that builds the execution context, and to the websocket channel.
"""

from collections.abc import Mapping

from starlette.requests import HTTPConnection

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

    async def authenticate(self, connection: HTTPConnection) -> Auth:
        """Who is behind a request or a websocket connection: what the transport asks."""
        return await self.identify(connection.headers, connection.query_params.get("token"))


def token_from_header(headers: Mapping[str, str]) -> str | None:
    header = headers.get("authorization", "")
    return header.removeprefix("Bearer ") if header.startswith("Bearer ") else None


def token_from_cookie(headers: Mapping[str, str]) -> str | None:
    for part in headers.get("cookie", "").split(";"):
        name, _, value = part.strip().partition("=")
        if name == "token" and value:
            return value
    return None
