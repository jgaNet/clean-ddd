"""The relay at start delivers what a previous run made durable and did not publish (ADR 24). It
runs in a context the transport builds as it builds a request's, with a unit of work of its own: a
reaction it delivers runs in a transaction, and what the reaction tells is made durable and relayed
under the outbox entry's id, which the bus recognises if the fact comes again (ADR 30)."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import pytest

from architecture.application.domain_events import publish_integration_event
from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation
from architecture.application.outbox import OutboxEntry, relay_outbox
from architecture.domain.event import DomainEvent, Event, IntegrationEvent, name_of
from architecture.domain.result import Result, Success
from architecture.infrastructure.event_bus import InMemoryEventBus
from architecture.infrastructure.outbox import InMemoryOutbox
from bootstrap.fastapi_application import FastApiApplication


@dataclass(frozen=True)
class NoteArchived(DomainEvent):
    note_id: str


@dataclass(frozen=True)
class ArchivingTold(IntegrationEvent):
    note_id: str


class TellTheArchiving(EventHandler[NoteArchived]):
    """A reaction that tells other contexts, as a domain event handler does (ADR 30)."""

    async def execute(self, event: NoteArchived, context: ExecutionContext) -> Result[None]:
        publish_integration_event(ArchivingTold(note_id=event.note_id), context)
        return Success(None)


class Listener:
    """Another context, listening: the id of every message it is handed."""

    def __init__(self) -> None:
        self.told: list[str] = []

    async def handle(self, operation: Operation[Any]) -> Operation[Any]:
        self.told.append(operation.id)
        return operation.sent()


async def test_the_relay_at_start_runs_a_reaction_in_a_unit_of_work_so_what_it_tells_goes_through_the_outbox(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    outbox = InMemoryOutbox.shared
    bus = InMemoryEventBus()
    app = FastApiApplication(bus, stores=[outbox.store], api_prefix="v1")
    await bus.subscribe(name_of(NoteArchived), TellTheArchiving())
    listener = Listener()
    await bus.subscribe(name_of(ArchivingTold), listener)

    # What a run that died after its commit left pending.
    outbox.append([NoteArchived(note_id="n-1")])
    durable: list[str] = []
    append = outbox.append

    def recording(events: Sequence[Event]) -> list[OutboxEntry]:
        entries = append(events)
        durable.extend(entry.id for entry in entries)
        return entries

    monkeypatch.setattr(outbox, "append", recording)

    relay_outbox(outbox, bus, app.execution_context("startup"))
    await bus.settle()

    assert len(listener.told) == 1
    assert listener.told[0] in durable
    assert outbox.pending() == []
