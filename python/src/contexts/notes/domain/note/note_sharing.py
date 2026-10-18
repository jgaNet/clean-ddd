"""NoteSharing is a domain service: "a note can only be shared with an account that exists" is
a business rule, but the aggregate cannot check it alone because accounts live in another
context. The service asks through a port Notes owns (``AccountDirectory``), then lets the
aggregate apply its own rules (owner only, not archived, not twice, not yourself)."""

from architecture.domain.id import Id
from architecture.domain.result import Failure, Result
from contexts.notes.domain.note.note import Note
from contexts.notes.domain.note.note_exceptions import RecipientNotFoundException
from contexts.notes.domain.note.ports.account_directory import AccountDirectory


class NoteSharing:
    def __init__(self, accounts: AccountDirectory) -> None:
        self._accounts = accounts

    async def share(self, note: Note, actor: Id, recipient: Id) -> Result[None]:
        if not await self._accounts.exists(recipient.value):
            return Failure(RecipientNotFoundException(note.id.value, recipient.value))
        return note.share_with(actor, recipient)
