from architecture.application.execution_context import ExecutionContext
from contexts.notes.application.commands.test_commands import RecordingBus
from contexts.notes.application.events.note_shared_handler import NoteSharedHandler
from contexts.notes.domain.note.events import NoteSharedEvent
from shared_kernel.application.integration_events.note_integration_events import NoteSharedIntegrationEvent


async def test_republishes_the_domain_event_as_the_integration_event_other_contexts_subscribe_to() -> None:
    bus = RecordingBus()
    context = ExecutionContext(trace_id="trace", event_bus=bus)

    await NoteSharedHandler().execute(
        NoteSharedEvent(note_id="note-1", title="Groceries", owner_id="alice", recipient_id="bob"), context
    )

    assert bus.published == [
        NoteSharedIntegrationEvent(note_id="note-1", title="Groceries", owner_id="alice", recipient_id="bob")
    ]
