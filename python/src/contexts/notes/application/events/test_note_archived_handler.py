from architecture.application.execution_context import ExecutionContext
from contexts.notes.application.commands.test_commands import RecordingBus
from contexts.notes.application.events.note_archived_handler import NoteArchivedHandler
from contexts.notes.domain.note.events import NoteArchivedEvent
from shared_kernel.application.integration_events.note_integration_events import NoteArchivedIntegrationEvent


async def test_republishes_the_domain_event_as_the_integration_event_naming_every_recipient() -> None:
    bus = RecordingBus()
    context = ExecutionContext(trace_id="trace", event_bus=bus)

    await NoteArchivedHandler().execute(
        NoteArchivedEvent(note_id="note-1", title="Groceries", owner_id="alice", shared_with=["bob", "carol"]),
        context,
    )

    assert bus.published == [
        NoteArchivedIntegrationEvent(
            note_id="note-1", title="Groceries", owner_id="alice", recipient_ids=["bob", "carol"]
        )
    ]


async def test_publishes_the_fact_even_when_the_note_was_shared_with_nobody() -> None:
    bus = RecordingBus()
    context = ExecutionContext(trace_id="trace", event_bus=bus)

    await NoteArchivedHandler().execute(
        NoteArchivedEvent(note_id="note-1", title="Groceries", owner_id="alice", shared_with=[]), context
    )

    assert bus.published == [
        NoteArchivedIntegrationEvent(note_id="note-1", title="Groceries", owner_id="alice", recipient_ids=[])
    ]
