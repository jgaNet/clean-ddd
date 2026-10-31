"""The composition root of this reference: the one place that knows its four contexts and their
routes. It builds the bus (the in-memory one, tracked), the stores and the modules from each
context's wiring, and puts them on the transport (``fastapi_application.py``, which knows no
context) with Security's authentication; its routes go under the API prefix, the websocket at the
root. Then it starts the modules, seeds the administrator through the same handler as any
command, and returns the application, ready to listen. The front end is not served here: it is a
client like any other (``web/``, served by any static server), so the API answers it as it answers
an API client, with CORS for the origins the settings allow.

A new application does not start from this file: ``clean-ddd create`` gives it
``starter/create_application.py`` in its place, which wires the Tracker alone (ADR 27).
"""

from typing import Any

from architecture.application.execution_context import Logger
from architecture.application.outbox import relay_outbox
from architecture.domain.result import Failure
from architecture.infrastructure.console_logger import ConsoleLogger
from architecture.infrastructure.event_bus import InMemoryEventBus
from architecture.infrastructure.outbox import InMemoryOutbox
from bootstrap.fastapi_application import FastApiApplication
from bootstrap.home import HomeViewModel, home_routes
from bootstrap.settings import Settings
from contexts.notes.infrastructure.directories import SecurityAccountDirectory
from contexts.notes.module_local import local_notes_module, note_store
from contexts.notes.presentation.routes import note_routes
from contexts.notifications.module_local import local_notifications_module, notification_store
from contexts.notifications.presentation.routes import notification_routes
from contexts.security.module_local import account_store, local_security_module
from contexts.security.presentation.routes import auth_routes
from contexts.tracker.module_local import local_tracker_module, operation_records, operation_store, tracked_event_bus
from contexts.tracker.presentation.routes import operation_routes


async def create_application(settings: Settings | None = None, logger: Logger | None = None) -> FastApiApplication:
    """Builds the whole application. Without settings it reads them from the environment and logs
    to the console, as the process does; a test gives its own, and a logger if it wants one. The
    modules start before the seed so that the seed's events reach their handlers."""
    if settings is None:
        settings = Settings.from_env()
        logger = logger or ConsoleLogger(debug=settings.debug)
    # The stores, listed once: the unit of work of a request snapshots them all, the process's
    # outbox among them (ADR 24), so a rolled-back transaction drops the facts it appended.
    notes = note_store()
    accounts = account_store()
    operations = operation_store()
    notifications_ = notification_store()
    stores: list[Any] = [notes, accounts, operations, notifications_, InMemoryOutbox.shared.store]

    # The application's bus: the in-memory bus, decorated so that every operation is recorded.
    records = operation_records(operations)
    event_bus = tracked_event_bus(InMemoryEventBus(), records)

    # The modules, from each context's wiring. Notes asks Security's read model through its own
    # port: the adapter is built here, where the two contexts meet.
    security = local_security_module(accounts, settings.security)
    tracker = local_tracker_module(records)
    notes_module = local_notes_module(notes, SecurityAccountDirectory(security.account_queries))
    notifications = local_notifications_module(notifications_, settings.notifications, logger)

    app = FastApiApplication(
        event_bus,
        stores=stores,
        api_prefix=settings.api_prefix,
        port=settings.port,
        web_origins=settings.web_origins,
        authenticate=security.authentication.authenticate,
        logger=logger,
        title=settings.name,
        version=settings.version,
    )
    app.register_module(tracker).register_module(notes_module)
    app.register_module(security.module).register_module(notifications.module)
    await app.start_modules()
    # What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
    # an in-memory outbox, and the line is where a store's outbox would be relayed. The context is
    # one a request would get, with a unit of work of its own, so that each reaction it delivers
    # runs in a transaction of its own and publishes through the outbox, as after a request.
    relay_outbox(InMemoryOutbox.shared, event_bus, app.execution_context("startup"))

    # The routes, under the API prefix, each context's under its own; the websocket at the root.
    home = HomeViewModel(name=settings.name, version=settings.version)
    app.register_routes(home_routes(home))
    app.register_routes(note_routes(notes_module))
    app.register_routes(operation_routes(tracker))
    app.register_routes(auth_routes(security.module))
    app.register_routes(notification_routes(notifications.module))
    app.fastapi.include_router(notifications.websocket.routes())

    # The administrator account the settings describe, created before the first request.
    if settings.admin_account is not None:
        seeded = await security.register_admin(
            settings.admin_account.identifier, settings.admin_account.password, event_bus
        )
        if isinstance(seeded, Failure) and logger:
            logger.error("The administrator could not be registered", seeded.error.message)

    return app
