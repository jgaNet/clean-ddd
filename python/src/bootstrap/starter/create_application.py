"""The composition root an application starts from (ADR 27): ``clean-ddd create`` gives it as
``src/bootstrap/create_application.py``, in place of this repository's, which knows four contexts.
It knows one, the Tracker, because a command is answered ``202 { operationId }`` and the Tracker is
what a client follows that operation at, up to its outcome and its result
(``GET /v1/tracker/operations/{id}``). Nobody signs in here: every caller is anonymous until a
context that owns accounts gives the transport its ``authenticate``.

A new context is added here, as the Tracker is: its store among the stores, its module after the
Tracker's, its router registered under the API prefix (the router carries its own, ``/notes``).
"""

import os
from collections.abc import Sequence
from typing import Any

from architecture.application.execution_context import ExecutionContext, Logger
from architecture.application.outbox import relay_outbox
from architecture.infrastructure.console_logger import ConsoleLogger
from architecture.infrastructure.event_bus import InMemoryEventBus
from architecture.infrastructure.outbox import InMemoryOutbox
from bootstrap.fastapi_application import FastApiApplication
from contexts.tracker.module_local import local_tracker_module, operation_records, operation_store, tracked_event_bus
from contexts.tracker.presentation.routes import operation_routes


async def create_application(
    logger: Logger | None = None,
    *,
    api_prefix: str | None = None,
    port: int | None = None,
    web_origins: Sequence[str] | None = None,
) -> FastApiApplication:
    """Builds the application; what is not given is read from the environment (``API_PREFIX``,
    default ``v1``; ``PORT``, default 10000; ``WEB_ORIGINS``, comma-separated, default none)."""
    env = os.environ.get
    logger = logger or ConsoleLogger(debug=False)
    # The stores a request's unit of work snapshots, the process's outbox among them (ADR 24).
    operations = operation_store()
    stores: list[Any] = [operations, InMemoryOutbox.shared.store]

    # The application's bus: the in-memory bus, decorated so that every operation is recorded.
    records = operation_records(operations)
    event_bus = tracked_event_bus(InMemoryEventBus(), records)
    tracker = local_tracker_module(records)

    app = FastApiApplication(
        event_bus,
        stores=stores,
        api_prefix=api_prefix or env("API_PREFIX") or "v1",
        port=int(env("PORT") or 10000) if port is None else port,
        web_origins=[origin for origin in (env("WEB_ORIGINS") or "").split(",") if origin]
        if web_origins is None
        else web_origins,
        logger=logger,
    )
    app.register_module(tracker)
    await app.start_modules()
    # What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
    # an in-memory outbox, and the line is where a store's outbox would be relayed.
    relay_outbox(
        InMemoryOutbox.shared, event_bus, ExecutionContext(trace_id="startup", event_bus=event_bus, logger=logger)
    )

    app.register_routes(operation_routes(tracker))
    return app
