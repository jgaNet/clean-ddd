"""The relay acknowledges an outbox entry once every reaction it reached has committed, never
sooner (ADR 24): a process that dies while a reaction runs has not lost the fact, and the next
relay hands it out again to the subscribers that had not handled it yet."""

import asyncio
from dataclasses import dataclass

import pytest

from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.outbox import relay_outbox
from architecture.domain.common_exceptions import NotFoundException
from architecture.domain.event import DomainEvent, name_of
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.event_bus import InMemoryEventBus
from architecture.infrastructure.outbox import InMemoryOutbox


@dataclass(frozen=True)
class BookingConfirmed(DomainEvent):
    booking_id: str


class TellTheHost(EventHandler[BookingConfirmed]):
    """A reaction that waits until the test lets it finish, and fails while ``failing`` says so."""

    def __init__(self) -> None:
        self.handled = 0
        self.failing = False
        self._gate = asyncio.Event()
        self._gate.set()

    def hold(self) -> None:
        self._gate.clear()

    def release(self) -> None:
        self._gate.set()

    async def execute(self, event: BookingConfirmed, context: ExecutionContext) -> Result[None]:
        self.handled += 1
        await self._gate.wait()
        return Failure(NotFoundException("Test", "the service refused")) if self.failing else Success(None)


async def let_it_run() -> None:
    """Lets the loop run what the relay scheduled, without waiting for a reaction that is held."""
    await asyncio.sleep(0.01)


async def test_keeps_an_entry_pending_while_a_reaction_to_it_runs_and_hands_it_out_once_meanwhile() -> None:
    bus = InMemoryEventBus()
    reaction = TellTheHost()
    await bus.subscribe(name_of(BookingConfirmed), reaction)
    outbox = InMemoryOutbox()
    context = ExecutionContext(trace_id="relay", event_bus=bus)
    [entry] = outbox.append([BookingConfirmed(booking_id="b-1")])

    reaction.hold()
    relay_outbox(outbox, bus, context)
    await let_it_run()
    # The reaction has not committed: a crash now must find the fact still owed.
    assert outbox.pending() == [entry]
    # A second relay (the next commit's) does not hand out an entry already on its way.
    assert relay_outbox(outbox, bus, context) == []
    await let_it_run()
    assert reaction.handled == 1

    reaction.release()
    await bus.settle()
    assert outbox.pending() == []


@pytest.mark.parametrize("refused_first", [False, True], ids=["told-then-refused", "refused-then-told"])
async def test_keeps_an_entry_whose_reaction_failed_pending_and_hands_it_again_to_that_subscriber_only(
    refused_first: bool,
) -> None:
    bus = InMemoryEventBus()
    told, refused = TellTheHost(), TellTheHost()
    # Either order: each subscriber's inbox is decided by its own outcome, not by how the last one ended.
    for subscriber in (refused, told) if refused_first else (told, refused):
        await bus.subscribe(name_of(BookingConfirmed), subscriber)
    outbox = InMemoryOutbox()
    context = ExecutionContext(trace_id="relay", event_bus=bus)
    [entry] = outbox.append([BookingConfirmed(booking_id="b-2")])

    refused.failing = True
    relay_outbox(outbox, bus, context)
    await bus.settle()
    assert outbox.pending() == [entry]

    refused.failing = False
    relay_outbox(outbox, bus, context)
    await bus.settle()
    assert outbox.pending() == []
    assert [told.handled, refused.handled] == [1, 2]
