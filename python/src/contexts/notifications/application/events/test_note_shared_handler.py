from architecture.domain.result import Success
from contexts.notifications.application.events.note_shared_handler import NoteSharedIntegrationEventHandler
from contexts.notifications.application.test_delivery import FakeChannel, Fixture
from contexts.notifications.domain.notification.channel import Channel
from shared_kernel.application.integration_events.note_integration_events import NoteSharedIntegrationEvent


async def test_turns_the_notes_fact_into_a_live_notification_for_the_recipient_in_notifications_terms() -> None:
    websocket = FakeChannel(Channel.WEBSOCKET)
    fixture = Fixture(websocket)

    result = await NoteSharedIntegrationEventHandler(fixture.delivery).execute(
        NoteSharedIntegrationEvent(note_id="note-1", title="Groceries", owner_id="alice", recipient_id="bob"),
        fixture.context,
    )

    assert isinstance(result, Success)
    [delivered] = websocket.delivered
    assert (delivered.recipient_id, delivered.title) == ("bob", "A note was shared with you: Groceries")
    assert delivered.metadata == {"noteId": "note-1", "sharedBy": "alice", "source": "Notes.NoteShared"}
    saved = fixture.saved(result.data)
    assert (saved.recipient_id, saved.channels) == ("bob", [Channel.WEBSOCKET])
