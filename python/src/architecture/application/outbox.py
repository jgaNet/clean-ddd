"""The transactional outbox (ADR 24): the facts a transaction makes durable with the state they
describe, published after the commit by a relay. A domain event is never published from memory
alone: ``publish_domain_events()`` appends it here at commit, inside the transaction, so a
rollback drops it with the writes it described, and ``ExecutionContext.with_transaction()``
relays what is pending once the commit is through. A process that dies between the commit and
the relay delays the fact until the next relay — the next commit, or the application's start —
instead of losing it.

The outbox is the unit of work's (``UnitOfWork.outbox``), since it lives and dies with the
transaction, and one per process, since a relay publishes whatever is pending, whoever stored
it. Delivery is therefore at least once; the bus delivers a message it already delivered to a
subscriber once only, by the entry's id, which travels as the message's id.

The port is async, like every repository port: a durable outbox is a table, and appending to it,
reading it and acknowledging an entry are I/O.

Implementations: architecture/infrastructure/outbox.py, an in-memory store the in-memory unit
of work snapshots and restores with the others.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from architecture.domain.event import Event, name_of

if TYPE_CHECKING:
    from architecture.application.event_bus import EventBus
    from architecture.application.execution_context import ExecutionContext


@dataclass(frozen=True)
class OutboxEntry:
    """A fact made durable and not yet published: the id the message will carry, and the event."""

    id: str
    event: Event


class Outbox(Protocol):
    async def append(self, events: Sequence[Event]) -> list[OutboxEntry]:
        """Stores the events with the transaction's writes, to be rolled back with them. The entries, in order."""
        ...

    async def pending(self) -> list[OutboxEntry]:
        """What is durable and not yet published, oldest first."""
        ...

    async def mark_published(self, id: str) -> None:
        """Acknowledges a delivery: the entry will not be published again."""
        ...


#: The entries handed to the bus whose reactions have not all finished yet, by id. Process-wide
#: and not per outbox: a durable outbox is a table, and an adapter built for each unit of work is a
#: new object over the same entries, which a guard kept per object would not recognise. An entry's
#: id is unique, so the id alone names it.
_on_their_way: set[str] = set()


#: The acknowledgements still waiting on a delivery: held here so that the loop does not drop them.
_acknowledging: set[asyncio.Task[None]] = set()


async def relay_outbox(outbox: Outbox, event_bus: EventBus, context: ExecutionContext) -> list[OutboxEntry]:
    """Publishes every pending entry through the bus, with the entry's id as the message's id, and
    marks it published once every reaction it reached has committed (the operation's
    ``delivered``), never sooner: a process that dies while a reaction runs leaves the entry
    pending, and the next relay hands it out again, to the subscribers that had not handled it
    yet. An entry whose reaction failed stays pending too, for the next relay; one still on its way
    is not handed out a second time meanwhile, from the moment this relay takes it until its
    acknowledgement is through. A publication that raises leaves the entry pending, and the relay
    goes on with the next entry: one fact that cannot go out does not hold the others. The
    acknowledgement waits on the delivery in a task of its own, since the bus dispatches after
    ``publish()`` returns; a process that stops before it has run leaves the entry pending, for the
    next relay, which is what at least once allows. The context's relay after each commit and the
    bootstrap's at start are the two callers. Returns the entries handed to the bus."""
    handed: list[OutboxEntry] = []
    for entry in await outbox.pending():
        if entry.id in _on_their_way:
            continue
        _on_their_way.add(entry.id)
        try:
            delivered = event_bus.publish(entry.event, context, message_id=entry.id).delivered
        except Exception as error:
            _on_their_way.discard(entry.id)
            _stays_pending(entry, error, context)
            continue
        handed.append(entry)
        if delivered is None:
            await _acknowledge(outbox, entry, True, context)
            continue
        acknowledgement = asyncio.ensure_future(_acknowledge_once_delivered(outbox, entry, delivered, context))
        _acknowledging.add(acknowledgement)
        acknowledgement.add_done_callback(_acknowledging.discard)
    return handed


async def _acknowledge_once_delivered(
    outbox: Outbox, entry: OutboxEntry, delivered: asyncio.Future[bool], context: ExecutionContext
) -> None:
    """Once the delivery has settled: the entry is published if every reaction succeeded. Awaited
    straight on the delivery, so that the acknowledgement follows it at once; a delivery cancelled,
    or an acknowledgement cancelled at shutdown, leaves the entry pending for the next relay."""
    try:
        every_one = await delivered
    except asyncio.CancelledError:
        _on_their_way.discard(entry.id)
        raise
    await _acknowledge(outbox, entry, every_one, context)


async def _acknowledge(outbox: Outbox, entry: OutboxEntry, every_one: bool, context: ExecutionContext) -> None:
    """Marks the entry published when it reached every subscriber, then lets it go: it is no longer
    on its way, published or pending for the next relay. An acknowledgement that raises leaves the
    entry pending; the bus's inbox keeps the subscribers that handled it from seeing it twice."""
    try:
        if every_one:
            await outbox.mark_published(entry.id)
    except Exception as error:
        _stays_pending(entry, error, context)
    finally:
        _on_their_way.discard(entry.id)


def _stays_pending(entry: OutboxEntry, error: Exception, context: ExecutionContext) -> None:
    if context.logger:
        context.logger.error(
            f"Outbox entry {entry.id} ({name_of(entry.event)}) stays pending", error, {"traceId": context.trace_id}
        )
