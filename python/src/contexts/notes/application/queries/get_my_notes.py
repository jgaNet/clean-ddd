from architecture.application.execution_context import ExecutionContext
from architecture.application.query_handler import QueryHandler
from architecture.domain.result import Failure, Result, Success
from contexts.notes.domain.note.note_exceptions import SERVICE
from contexts.notes.domain.note.ports.note_queries import NoteListItem, NoteQueries
from shared_kernel.application.guards import require_signed_in


class GetMyNotesQueryHandler(QueryHandler[NoteQueries, None, list[NoteListItem]]):
    async def execute(self, payload: None, context: ExecutionContext) -> Result[list[NoteListItem]]:
        owner = require_signed_in(context, SERVICE)
        if isinstance(owner, Failure):
            return owner
        return Success(await self.queries.find_by_owner(owner.data.value))
