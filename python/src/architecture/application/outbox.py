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

Implementations: architecture/infrastructure/outbox.py, an in-memory store the in-memory unit
of work snapshots and restores with the others.
"""

from __future__ import annotations

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
    def append(self, events: Sequence[Event]) -> list[OutboxEntry]:
        """Stores the events with the transaction's writes, to be rolled back with them. The entries, in order."""
        ...

    def pending(self) -> list[OutboxEntry]:
        """What is durable and not yet published, oldest first."""
        ...

    def mark_published(self, id: str) -> None:
        """Acknowledges a delivery: the entry will not be published again."""
        ...


def relay_outbox(outbox: Outbox, event_bus: EventBus, context: ExecutionContext) -> list[OutboxEntry]:
    """Publishes every pending entry through the bus, with the entry's id as the message's id, and
    marks it published once the bus has it. A publication that raises leaves the entry pending,
    for the next relay, and the relay goes on with the next entry: one fact that cannot go out
    does not hold the others. The context's relay after each commit and the bootstrap's at start
    are the two callers."""
    published: list[OutboxEntry] = []
    for entry in outbox.pending():
        try:
            event_bus.publish(entry.event, context, message_id=entry.id)
            outbox.mark_published(entry.id)
            published.append(entry)
        except Exception as error:
            if context.logger:
                context.logger.error(
                    f"Outbox entry {entry.id} ({name_of(entry.event)}) stays pending",
                    error,
                    {"traceId": context.trace_id},
                )
    return published
