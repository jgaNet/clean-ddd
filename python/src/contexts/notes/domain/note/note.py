"""Note is the aggregate root of the Notes context.

Everything that can happen to a note goes through a method here, and every method enforces the
business rules before changing state:

- a note always has a valid title (``NoteTitle`` value object)
- only the owner can edit, archive, restore or share a note
- an archived note is read-only until it is restored: it can be neither edited nor shared
  (``_ensure_active()``); archiving, restoring and reading it are not gated by that rule
- a note cannot be shared twice with the same account, nor with its owner

The aggregate never touches persistence, logging or HTTP. It only knows business.
"""

from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result, Success
from contexts.notes.domain.note.dtos import NewNote, NoteSnapshot
from contexts.notes.domain.note.events import (
    NoteArchivedEvent,
    NoteCreatedEvent,
    NoteEditedEvent,
    NoteRestoredEvent,
    NoteSharedEvent,
)
from contexts.notes.domain.note.note_exceptions import (
    CannotShareWithSelfException,
    NoteAlreadyArchivedException,
    NoteAlreadySharedException,
    NoteArchivedException,
    NoteNotArchivedException,
    NotNoteOwnerException,
)
from contexts.notes.domain.note.note_status import NoteStatus
from contexts.notes.domain.note.note_title import NoteTitle

OK: Result[None] = Success(None)


class Note(AggregateRoot):
    __slots__ = ("_content", "_owner_id", "_shared_with", "_status", "_title")

    def __init__(
        self,
        id: Id,  # noqa: A002
        owner_id: Id,
        title: NoteTitle,
        content: str,
        status: NoteStatus,
        shared_with: list[str],
        version: int = 0,
    ) -> None:
        """Private: the only ways in are ``create()`` and ``from_snapshot()``."""
        super().__init__(id, version)
        self._owner_id = owner_id
        self._title = title
        self._content = content
        self._status = status
        self._shared_with: list[str] = list(shared_with)  # raw ids, in the order they were added

    @staticmethod
    def create(props: NewNote) -> Result["Note"]:
        """Writes a brand new note. This is the only way to bring a Note into existence. The
        aggregate picks its own identity, so no persistence round-trip is needed first."""
        title = NoteTitle.create(props.title)
        if isinstance(title, Failure):
            return title
        id = Id.generate()  # noqa: A001
        note = Note(id, Id(props.owner_id), title.data, props.content, NoteStatus.ACTIVE, [])
        note._record(NoteCreatedEvent(note_id=id.value, owner_id=props.owner_id, title=title.data.value))
        return Success(note)

    @staticmethod
    def from_snapshot(snapshot: NoteSnapshot) -> "Note":
        """Rebuilds a Note from what was persisted. No event is recorded: nothing new happened.

        Persisted data has already been validated, so an invalid snapshot is a programming error
        and raises instead of returning a Result (ADR 4). Trade-off to keep in mind: this re-runs
        today's NoteTitle rules on yesterday's data. If a rule gets stricter (say MAX_LENGTH
        shrinks), migrate existing notes before shipping it, or older notes will refuse to load.
        """
        title = NoteTitle.create(snapshot.title)
        if isinstance(title, Failure):
            raise ValueError(f"Corrupted note {snapshot.id}: {title.error.message}")
        return Note(
            Id(snapshot.id),
            Id(snapshot.owner_id),
            title.data,
            snapshot.content,
            snapshot.status,
            snapshot.shared_with,
            snapshot.version,
        )

    def edit(self, editor_id: Id, title: str, content: str) -> Result[None]:
        allowed = self._ensure_owner(editor_id)
        if isinstance(allowed, Failure):
            return allowed
        writable = self._ensure_active()
        if isinstance(writable, Failure):
            return writable
        new_title = NoteTitle.create(title)
        if isinstance(new_title, Failure):
            return new_title

        self._title = new_title.data
        self._content = content
        self._record(NoteEditedEvent(note_id=self.id.value, title=new_title.data.value))
        return OK

    def archive(self, actor_id: Id) -> Result[None]:
        allowed = self._ensure_owner(actor_id)
        if isinstance(allowed, Failure):
            return allowed
        if self._status is NoteStatus.ARCHIVED:
            return Failure(NoteAlreadyArchivedException(self.id.value))

        self._status = NoteStatus.ARCHIVED
        self._record(
            NoteArchivedEvent(
                note_id=self.id.value,
                title=self._title.value,
                owner_id=self._owner_id.value,
                shared_with=list(self._shared_with),
            )
        )
        return OK

    def restore(self, actor_id: Id) -> Result[None]:
        allowed = self._ensure_owner(actor_id)
        if isinstance(allowed, Failure):
            return allowed
        if self._status is not NoteStatus.ARCHIVED:
            return Failure(NoteNotArchivedException(self.id.value))

        self._status = NoteStatus.ACTIVE
        self._record(NoteRestoredEvent(note_id=self.id.value))
        return OK

    def share_with(self, actor_id: Id, recipient_id: Id) -> Result[None]:
        allowed = self._ensure_owner(actor_id)
        if isinstance(allowed, Failure):
            return allowed
        writable = self._ensure_active()
        if isinstance(writable, Failure):
            return writable
        if recipient_id == self._owner_id:
            return Failure(CannotShareWithSelfException(self.id.value))
        if recipient_id.value in self._shared_with:
            return Failure(NoteAlreadySharedException(self.id.value, recipient_id.value))

        self._shared_with.append(recipient_id.value)
        self._record(
            NoteSharedEvent(
                note_id=self.id.value,
                title=self._title.value,
                owner_id=self._owner_id.value,
                recipient_id=recipient_id.value,
            )
        )
        return OK

    def is_visible_to(self, account_id: Id) -> bool:
        return self._owner_id == account_id or account_id.value in self._shared_with

    def to_snapshot(self) -> NoteSnapshot:
        """The plain data to persist. ``from_snapshot(note.to_snapshot())`` gives back an equal note."""
        return NoteSnapshot(
            id=self.id.value,
            owner_id=self._owner_id.value,
            title=self._title.value,
            content=self._content,
            status=self._status,
            shared_with=list(self._shared_with),
            version=self.version,
        )

    def _ensure_owner(self, actor_id: Id) -> Result[None]:
        if self._owner_id != actor_id:
            return Failure(NotNoteOwnerException(self.id.value, actor_id.value))
        return OK

    def _ensure_active(self) -> Result[None]:
        if self._status is NoteStatus.ARCHIVED:
            return Failure(NoteArchivedException(self.id.value))
        return OK

    @property
    def owner_id(self) -> Id:
        return self._owner_id

    @property
    def title(self) -> str:
        return self._title.value

    @property
    def content(self) -> str:
        return self._content

    @property
    def status(self) -> NoteStatus:
        return self._status

    @property
    def shared_with(self) -> list[str]:
        return list(self._shared_with)
