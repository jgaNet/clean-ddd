"""The transport, and nothing of the business: a FastAPI application on uvicorn that gives each
request its identity and its ``ExecutionContext``, lets the origins it is given call it (CORS),
answers a programming error, serves the routers it is given under one API prefix, and listens.
It names no context. A composition root (``create_application.py``) builds one on the bus, the
stores and, when the application has accounts, the authentication of the context that owns them;
registers the modules and their routes; starts the modules; and returns it. Without an
authentication, every caller is anonymous.
"""

import asyncio
from collections.abc import Awaitable, Callable, Iterable, Sequence
from typing import Any, Self

import uvicorn
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import HTTPConnection, Request
from starlette.responses import HTMLResponse, JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from architecture.application.application import Application
from architecture.application.event_bus import EventBus
from architecture.application.execution_context import Auth, ExecutionContext, Logger
from architecture.domain.id import Id
from architecture.infrastructure.data_sources import InMemoryDataSource
from architecture.infrastructure.unit_of_work import InMemoryUnitOfWork
from architecture.presentation.format import Format, format_of

TRACE_HEADER = "x-trace-id"

#: Who is calling when nobody says otherwise: no subject, no role.
ANONYMOUS = Auth()

#: Says who is behind a request or a websocket connection; the context that owns accounts provides it.
type Authenticate = Callable[[HTTPConnection], Awaitable[Auth]]


async def anonymous(connection: HTTPConnection) -> Auth:
    return ANONYMOUS


class Identify:
    """Who is calling, on every HTTP request and every websocket connection, before anything else
    runs; it never blocks. The ``Auth`` travels on the connection's state (``request.state.auth``,
    ``websocket.state.auth``) to the middleware that builds the execution context, and to a
    websocket endpoint."""

    def __init__(self, app: ASGIApp, authenticate: Authenticate) -> None:
        self._app = app
        self._authenticate = authenticate

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in ("http", "websocket"):
            scope.setdefault("state", {})["auth"] = await self._authenticate(HTTPConnection(scope))
        await self._app(scope, receive, send)


async def programming_error(request: Request, error: Exception) -> Response:
    """Only a programming error gets here: an expected failure is a ``Result``, answered by its route."""
    if format_of(request.headers) is Format.HTMX:
        return HTMLResponse("<div>Internal Server Error</div>", status_code=500)
    return JSONResponse({"message": "Internal Server Error"}, status_code=500)


class FastApiApplication(Application):
    """The modules on one bus (``Application``), served over HTTP. Not yet listening: ``start()``."""

    def __init__(
        self,
        event_bus: EventBus,
        *,
        stores: Iterable[InMemoryDataSource[Any]],
        api_prefix: str,
        port: int = 0,
        web_origins: Sequence[str] = (),
        authenticate: Authenticate = anonymous,
        logger: Logger | None = None,
        title: str = "API",
        version: str = "0.0.0",
    ) -> None:
        super().__init__(event_bus)
        #: Every router is served under it: ``v1`` serves ``/notes`` at ``/v1/notes``.
        self.api_prefix = api_prefix
        #: The port ``start()`` listens on when it is given none; 0 asks the OS for a free one.
        self.port = port
        self.logger = logger
        self.fastapi = FastAPI(title=title, version=version, docs_url=f"/{api_prefix}/docs")
        # The stores a request's unit of work snapshots, the process's outbox among them (ADR 24),
        # so a rolled-back transaction drops the facts it appended.
        snapshotted = list(stores)

        # One execution context per request: its trace, its caller, and its own unit of work. A
        # unit of work is a request-scoped thing; sharing one instance across requests would make
        # concurrent commands join each other's transaction. Middlewares run from the last added
        # to the first: the caller is identified, then the context is built.
        @self.fastapi.middleware("http")
        async def with_execution_context(request: Request, call_next: RequestResponseEndpoint) -> Response:
            trace_id = request.headers.get(TRACE_HEADER) or Id.generate().value
            auth = getattr(request.state, "auth", None)
            request.state.execution_context = ExecutionContext(
                trace_id=trace_id,
                auth=auth if isinstance(auth, Auth) else ANONYMOUS,
                event_bus=self.event_bus,
                unit_of_work=InMemoryUnitOfWork(snapshotted),
                logger=logger,
            )
            response = await call_next(request)
            response.headers[TRACE_HEADER] = trace_id
            return response

        self.fastapi.add_middleware(Identify, authenticate=authenticate)
        # The front end is a client like any other, served from wherever: a page on another origin
        # calls the API with a bearer token, never a cookie, and CORS lets it, for the origins
        # given (none: same-origin clients only).
        if web_origins:
            self.fastapi.add_middleware(
                CORSMiddleware,
                allow_origins=list(web_origins),
                allow_methods=["*"],
                allow_headers=["*"],
                expose_headers=[TRACE_HEADER],
            )
        self.fastapi.add_exception_handler(Exception, programming_error)

    def register_routes(self, router: APIRouter) -> Self:
        """A context's router, under ``/<api_prefix>``; the router carries its own prefix (``/notes``)."""
        self.fastapi.include_router(router, prefix=f"/{self.api_prefix}")
        return self

    async def start(self, port: int | None = None) -> "Running":
        """Listens on the port it was given; port 0 asks the OS for a free one (tests)."""
        config = uvicorn.Config(
            self.fastapi,
            host="127.0.0.1",
            port=self.port if port is None else port,
            log_level="warning",
            lifespan="off",
        )
        server = uvicorn.Server(config)
        serving = asyncio.create_task(server.serve())
        while not server.started:
            if serving.done():
                raise RuntimeError("The server could not start")
            await asyncio.sleep(0.01)
        running = Running(server, serving, self.event_bus)
        if self.logger:
            self.logger.info(f"Listening on {running.address}")
        return running


class Running:
    """The application, serving."""

    def __init__(self, server: uvicorn.Server, serving: "asyncio.Task[None]", event_bus: EventBus) -> None:
        self._server = server
        self._serving = serving
        self._event_bus = event_bus

    @property
    def address(self) -> str:
        """``http://127.0.0.1:<port>``"""
        host, port = self._server.servers[0].sockets[0].getsockname()[:2]
        return f"http://{host}:{port}"

    async def wait(self) -> None:
        """Serves until the transport ends."""
        await self._serving

    async def stop(self) -> None:
        """Stops serving: the dispatches in flight finish, then the server exits."""
        settle: Callable[[], Awaitable[None]] | None = getattr(self._event_bus, "settle", None)
        if settle is not None:
            await settle()
        self._server.should_exit = True
        await self._serving
