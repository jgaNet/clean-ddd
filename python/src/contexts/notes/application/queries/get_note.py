from architecture.application.execution_context import ExecutionContext
from architecture.application.query_handler import QueryHandler
from architecture.domain.result import Failure, Result, Success
from contexts.notes.domain.note.note_exceptions import SERVICE, NoteNotFoundException
from contexts.notes.domain.note.ports.note_queries import NoteDetail, NoteQueries
from shared_kernel.application.guards import require_signed_in


class GetNoteQueryHandler(QueryHandler[NoteQueries, str, NoteDetail]):
    async def execute(self, note_id: str, context: ExecutionContext) -> Result[NoteDetail]:
        reader = require_signed_in(context, SERVICE)
        if isinstance(reader, Failure):
            return reader

        note = await self.queries.find_by_id(note_id)

        # A note someone else owns and did not share with you does not exist, as far as you know.
        me = reader.data.value
        if note is None or (note.owner_id != me and me not in note.shared_with):
            return Failure(NoteNotFoundException(note_id))

        return Success(note)
