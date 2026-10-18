from architecture.application.execution_context import ExecutionContext
from architecture.application.query_handler import QueryHandler
from architecture.domain.result import Failure, Result, Success
from contexts.notes.domain.note.note_exceptions import SERVICE
from contexts.notes.domain.note.ports.note_queries import NoteQueries, SharedNoteListItem
from shared_kernel.application.guards import require_signed_in


class GetNotesSharedWithMeQueryHandler(QueryHandler[NoteQueries, None, list[SharedNoteListItem]]):
    async def execute(self, payload: None, context: ExecutionContext) -> Result[list[SharedNoteListItem]]:
        reader = require_signed_in(context, SERVICE)
        if isinstance(reader, Failure):
            return reader
        return Success(await self.queries.find_shared_with(reader.data.value))
