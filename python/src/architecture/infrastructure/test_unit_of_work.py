import pytest

from architecture.infrastructure.data_sources import InMemoryDataSource
from architecture.infrastructure.unit_of_work import InMemoryUnitOfWork


async def test_a_rollback_puts_every_store_back_as_it_was() -> None:
    notes: InMemoryDataSource[str] = InMemoryDataSource()
    accounts: InMemoryDataSource[str] = InMemoryDataSource()
    notes.collection["n1"] = "kept"
    unit_of_work = InMemoryUnitOfWork([notes, accounts])

    await unit_of_work.begin_transaction()
    notes.collection["n2"] = "written inside"
    accounts.collection["a1"] = "written inside"
    await unit_of_work.rollback_transaction()

    assert notes.collection == {"n1": "kept"}
    assert accounts.collection == {}
    assert not unit_of_work.has_active_transaction()


async def test_a_commit_keeps_what_was_written() -> None:
    notes: InMemoryDataSource[str] = InMemoryDataSource()
    unit_of_work = InMemoryUnitOfWork([notes])

    await unit_of_work.begin_transaction()
    assert unit_of_work.has_active_transaction()
    notes.collection["n1"] = "written inside"
    await unit_of_work.commit_transaction()

    assert notes.collection == {"n1": "written inside"}


async def test_pins_the_honest_limit_two_requests_over_the_same_stores_are_a_boundary_each_not_isolated() -> None:
    """A rollback undoes the other one too."""
    notes: InMemoryDataSource[str] = InMemoryDataSource()
    accounts: InMemoryDataSource[str] = InMemoryDataSource()
    notes.collection["n1"] = "before"
    unit_of_work = InMemoryUnitOfWork([notes, accounts])
    other = InMemoryUnitOfWork([notes, accounts])

    await unit_of_work.begin_transaction()
    notes.collection["n1"] = "first writer"
    await other.begin_transaction()
    notes.collection["n2"] = "second writer"
    await other.commit_transaction()
    await unit_of_work.rollback_transaction()

    assert notes.collection["n1"] == "before"
    # The second writer committed, and its write is gone with the first one's rollback: the snapshot is
    # of the whole store. A database keeps n2 here; the README lists this as the gap it is.
    assert "n2" not in notes.collection


async def test_misuse_is_a_programming_error() -> None:
    unit_of_work = InMemoryUnitOfWork([])
    with pytest.raises(RuntimeError, match="No active transaction to commit"):
        await unit_of_work.commit_transaction()
    await unit_of_work.begin_transaction()
    with pytest.raises(RuntimeError, match="already in progress"):
        await unit_of_work.begin_transaction()
