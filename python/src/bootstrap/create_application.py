"""The composition root: the one place that knows every context, every route and the transport.
It builds the bus (the in-memory one, tracked), the stores and the unit of work over them, the
modules from each context's wiring, the routes under the API prefix, and the two middlewares
that give each request its identity (Security's authentication) and its ``ExecutionContext``.
Then it starts the modules, seeds the administrator through the same handler as any command,
and only then listens. The websocket is served beside the API. The front end is not: it is a
client like any other (``web/``, served by any static server), so the API answers it as it
answers an API client, with CORS for the origins the settings allow.
"""

import asyncio
from typing import Any

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from architecture.application.application import Application
from architecture.application.execution_context import Auth, ExecutionContext, Logger
from architecture.domain.id import Id
from architecture.domain.result import Failure
from architecture.infrastructure.event_bus import InMemoryEventBus
from architecture.infrastructure.unit_of_work import InMemoryUnitOfWork
from bootstrap.home import HomeViewModel, home_routes
from bootstrap.settings import Settings
from contexts.notes.infrastructure.directories import SecurityAccountDirectory
from contexts.notes.module_local import local_notes_module, note_store
from contexts.notes.presentation.routes import note_routes
from contexts.notifications.module_local import local_notifications_module, notification_store
from contexts.notifications.presentation.routes import notification_routes
from contexts.security.module_local import account_store, local_security_module
from contexts.security.presentation.authentication import AuthenticationMiddleware
from contexts.security.presentation.routes import auth_routes
from contexts.tracker.infrastructure.tracked_event_bus import TrackedEventBus
from contexts.tracker.module_local import local_tracker_module, operation_records, operation_store, tracked_event_bus
from contexts.tracker.presentation.routes import operation_routes

TRACE_HEADER = "x-trace-id"


class App:
    """The application: wired, its modules listening on the bus, seeded; not yet serving."""

    def __init__(self, fastapi: FastAPI, event_bus: TrackedEventBus, logger: Logger | None, port: int) -> None:
        self.fastapi = fastapi
        self.event_bus = event_bus
        self.logger = logger
        self.port = port

    async def start(self, port: int | None = None) -> "Running":
        """Listens on the port of the settings; port 0 asks the OS for a free one (tests)."""
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

    def __init__(self, server: uvicorn.Server, serving: "asyncio.Task[None]", event_bus: TrackedEventBus) -> None:
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
        await self._event_bus.settle()
        self._server.should_exit = True
        await self._serving


async def create_application(settings: Settings, logger: Logger | None = None) -> App:
    """Builds the whole application. The modules start before the seed so that the seed's events
    reach their handlers."""
    # The stores, listed once: the unit of work of a request snapshots them all.
    notes = note_store()
    accounts = account_store()
    operations = operation_store()
    notifications_ = notification_store()
    stores: list[Any] = [notes, accounts, operations, notifications_]

    # The application's bus: the in-memory bus, decorated so that every operation is recorded.
    records = operation_records(operations)
    event_bus = tracked_event_bus(InMemoryEventBus(), records)

    # The modules, from each context's wiring. Notes asks Security's read model through its own
    # port: the adapter is built here, where the two contexts meet.
    security = local_security_module(accounts, settings.security)
    tracker = local_tracker_module(records)
    notes_module = local_notes_module(notes, SecurityAccountDirectory(security.account_queries))
    notifications = local_notifications_module(notifications_, settings.notifications, logger)

    application = Application(event_bus).register_module(tracker).register_module(notes_module)
    application.register_module(security.module).register_module(notifications.module)
    await application.start_modules()

    # The routes, under the API prefix, each context's under its own; the websocket at the root.
    fastapi = FastAPI(title=settings.name, version=settings.version, docs_url=f"/{settings.api_prefix}/docs")
    home = HomeViewModel(name=settings.name, version=settings.version)
    prefix = f"/{settings.api_prefix}"
    fastapi.include_router(home_routes(home), prefix=prefix)
    fastapi.include_router(note_routes(notes_module), prefix=prefix)
    fastapi.include_router(operation_routes(tracker), prefix=prefix)
    fastapi.include_router(auth_routes(security.module), prefix=prefix)
    fastapi.include_router(notification_routes(notifications.module), prefix=prefix)
    fastapi.include_router(notifications.websocket.routes())

    # One execution context per request: its trace, its caller, and its own unit of work. A unit
    # of work is a request-scoped thing; sharing one instance across requests would make
    # concurrent commands join each other's transaction. Middlewares run from the last added to
    # the first: the caller is identified (on requests and websocket connections alike), then
    # the context is built.
    @fastapi.middleware("http")
    async def with_execution_context(request: Request, call_next: RequestResponseEndpoint) -> Response:
        trace_id = request.headers.get(TRACE_HEADER) or Id.generate().value
        auth = getattr(request.state, "auth", None)
        request.state.execution_context = ExecutionContext(
            trace_id=trace_id,
            auth=auth if isinstance(auth, Auth) else Auth(),
            event_bus=event_bus,
            unit_of_work=InMemoryUnitOfWork(stores),
            logger=logger,
        )
        response = await call_next(request)
        response.headers[TRACE_HEADER] = trace_id
        return response

    fastapi.add_middleware(AuthenticationMiddleware, authentication=security.authentication)
    # A front end served from another origin calls the API with a bearer token, never a cookie.
    if settings.web_origins:
        fastapi.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.web_origins),
            allow_methods=["*"],
            allow_headers=["*"],
            expose_headers=[TRACE_HEADER],
        )

    # The administrator account the settings describe, created before the first request.
    if settings.admin_account is not None:
        seeded = await security.register_admin(
            settings.admin_account.identifier, settings.admin_account.password, event_bus
        )
        if isinstance(seeded, Failure) and logger:
            logger.error("The administrator could not be registered", seeded.error.message)

    return App(fastapi, event_bus, logger, settings.port)
