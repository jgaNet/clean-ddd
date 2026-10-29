"""The outbox port, held by its in-memory adapter: what is appended is pending, in order, until
it is published; and it lives and dies with the transaction (ADR 24)."""

from dataclasses import dataclass

from architecture.domain.event import DomainEvent
from architecture.infrastructure.outbox import InMemoryOutbox
from architecture.infrastructure.unit_of_work import InMemoryUnitOfWork


@dataclass(frozen=True)
class Greeted(DomainEvent):
    name: str


def test_keeps_what_is_appended_pending_oldest_first_until_it_is_marked_published() -> None:
    outbox = InMemoryOutbox()
    first, second = outbox.append([Greeted(name="alice"), Greeted(name="bob")])

    assert outbox.pending() == [first, second]
    assert first.id != second.id

    outbox.mark_published(first.id)
    assert outbox.pending() == [second]


async def test_is_rolled_back_with_the_transaction_that_appended_to_it_and_kept_by_one_that_commits() -> None:
    outbox = InMemoryOutbox()
    unit_of_work = InMemoryUnitOfWork([outbox.store], outbox)

    await unit_of_work.begin_transaction()
    outbox.append([Greeted(name="rolled back")])
    await unit_of_work.rollback_transaction()
    assert outbox.pending() == []

    await unit_of_work.begin_transaction()
    outbox.append([Greeted(name="committed")])
    await unit_of_work.commit_transaction()
    assert [entry.event for entry in outbox.pending()] == [Greeted(name="committed")]
