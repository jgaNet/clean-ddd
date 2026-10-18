"""Module wires one bounded context together: its commands, queries, domain events and
integration events. It is plain data plus two lookups; the business lives in the handlers
(ARCH-MODULES-DATA).

A Module is where the application layer (handlers) is bound to the infrastructure
(repositories, queries, external services) and subscribed to the event bus. Each context has
one wiring file per environment, ``contexts/<context>/module_local.py``::

    Module(
        name="Notes",
        commands=[Subscription(CreateNoteCommandEvent, [CreateNoteCommandHandler(note_repository)])],
        queries=[GetMyNotesQueryHandler(note_queries)],
        domain_events=[Subscription(NoteCreatedEvent, [NoteCreatedHandler()])],
    )

Anything else a context exposes (a middleware, a service another context needs) is a named
export of the same wiring file, not a slot in the module.

From a controller::

    context.event_bus.publish(CreateNoteCommandEvent(title=..., content=...), context)  # command, async
    await notes_module.get_query(GetMyNotesQueryHandler).handle(None, context)           # query, sync
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from architecture.application.command_handler import CommandHandler
from architecture.application.event_bus import EventBus
from architecture.application.event_handler import EventHandler
from architecture.application.query_handler import QueryHandler
from architecture.domain.event import Event, name_of

AnyQueryHandler = QueryHandler[Any, Any, Any]


@dataclass(frozen=True)
class Subscription:
    """An event's class and the handlers that answer it; the channel is the class's name."""

    event: type[Event]
    handlers: Sequence[EventHandler[Any]]


class Module:
    def __init__(
        self,
        *,
        name: str,
        commands: Sequence[Subscription] = (),
        queries: Sequence[AnyQueryHandler] = (),
        domain_events: Sequence[Subscription] = (),
        integration_events: Sequence[Subscription] = (),
    ) -> None:
        self.name = name
        self.commands = list(commands)
        self.queries = list(queries)
        self.domain_events = list(domain_events)
        self.integration_events = list(integration_events)

    async def start(self, event_bus: EventBus) -> None:
        await event_bus.connect()
        await self.subscribe(event_bus)

    async def subscribe(self, event_bus: EventBus) -> None:
        for subscription in [*self.domain_events, *self.commands, *self.integration_events]:
            for handler in subscription.handlers:
                await event_bus.subscribe(name_of(subscription.event), handler)

    def get_command[H: CommandHandler[Any]](self, handler: type[H]) -> H:
        """For the rare command a caller runs synchronously instead of publishing (a login)."""
        for subscription in self.commands:
            for candidate in subscription.handlers:
                if isinstance(candidate, handler):
                    return candidate
        raise LookupError(f"Missing command handler {handler.__name__} in module {self.name}")

    def get_query[H: AnyQueryHandler](self, handler: type[H]) -> H:
        for candidate in self.queries:
            if isinstance(candidate, handler):
                return candidate
        raise LookupError(f"Missing query {handler.__name__} in module {self.name}")
