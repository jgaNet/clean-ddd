from architecture.domain.result import Success
from contexts.notifications.application.events.note_archived_handler import NoteArchivedIntegrationEventHandler
from contexts.notifications.application.test_delivery import FakeChannel, Fixture
from contexts.notifications.domain.notification.channel import Channel
from shared_kernel.application.integration_events.note_integration_events import NoteArchivedIntegrationEvent


async def test_tells_every_person_the_note_was_shared_with_that_it_is_no_longer_available() -> None:
    websocket = FakeChannel(Channel.WEBSOCKET)
    fixture = Fixture(websocket)

    result = await NoteArchivedIntegrationEventHandler(fixture.delivery).execute(
        NoteArchivedIntegrationEvent(
            note_id="note-1", title="Groceries", owner_id="alice", recipient_ids=["bob", "carol"]
        ),
        fixture.context,
    )

    assert isinstance(result, Success)
    assert [(d.recipient_id, d.title) for d in websocket.delivered] == [
        ("bob", "A note is no longer available: Groceries"),
        ("carol", "A note is no longer available: Groceries"),
    ]
    assert websocket.delivered[0].metadata == {
        "noteId": "note-1",
        "archivedBy": "alice",
        "source": "Notes.NoteArchived",
    }
    assert [fixture.saved(notification_id).recipient_id for notification_id in result.data] == ["bob", "carol"]
    assert fixture.saved(result.data[0]).channels == [Channel.WEBSOCKET]


async def test_tells_nobody_when_the_note_was_shared_with_nobody() -> None:
    websocket = FakeChannel(Channel.WEBSOCKET)
    fixture = Fixture(websocket)

    result = await NoteArchivedIntegrationEventHandler(fixture.delivery).execute(
        NoteArchivedIntegrationEvent(note_id="note-1", title="Groceries", owner_id="alice", recipient_ids=[]),
        fixture.context,
    )

    assert result == Success([])
    assert websocket.delivered == [] and fixture.store.collection == {}
