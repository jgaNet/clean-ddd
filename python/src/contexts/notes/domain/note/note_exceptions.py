"""Domain exceptions describe a broken business rule, in business words.

They are values carried by ``Failure``, never raised: a refused command is a normal outcome, not
a crash. Each one names the rule it protects, as a PascalCase ``type`` a client reads on the
operation. One rule the user could act on differently, one exception.
"""

from typing import Any

from architecture.domain.exception import DomainException

SERVICE = "Notes"


class NoteDomainException(DomainException):
    def __init__(self, type: str, message: str, context: dict[str, Any] | None = None) -> None:  # noqa: A002
        super().__init__(service=SERVICE, type=type, message=message, context=context or {})


class BlankNoteTitleException(NoteDomainException):
    def __init__(self) -> None:
        super().__init__("BlankNoteTitle", "A note needs a title")


class NoteTitleTooLongException(NoteDomainException):
    def __init__(self, max_length: int, actual_length: int) -> None:
        super().__init__(
            "NoteTitleTooLong",
            f"A note title cannot exceed {max_length} characters",
            {"maxLength": max_length, "actualLength": actual_length},
        )


class NoteNotFoundException(NoteDomainException):
    def __init__(self, note_id: str) -> None:
        super().__init__("NoteNotFound", "Note not found", {"noteId": note_id})


class NotNoteOwnerException(NoteDomainException):
    def __init__(self, note_id: str, actor_id: str) -> None:
        super().__init__(
            "NotNoteOwner", "Only the owner of a note can change it", {"noteId": note_id, "actorId": actor_id}
        )


class NoteArchivedException(NoteDomainException):
    def __init__(self, note_id: str) -> None:
        super().__init__("NoteArchived", "An archived note is read-only; restore it first", {"noteId": note_id})


class NoteAlreadyArchivedException(NoteDomainException):
    def __init__(self, note_id: str) -> None:
        super().__init__("NoteAlreadyArchived", "This note is already archived", {"noteId": note_id})


class NoteNotArchivedException(NoteDomainException):
    def __init__(self, note_id: str) -> None:
        super().__init__("NoteNotArchived", "Only an archived note can be restored", {"noteId": note_id})


class NoteAlreadyPinnedException(NoteDomainException):
    def __init__(self, note_id: str) -> None:
        super().__init__("NoteAlreadyPinned", "This note is already pinned", {"noteId": note_id})


class NoteNotPinnedException(NoteDomainException):
    def __init__(self, note_id: str) -> None:
        super().__init__("NoteNotPinned", "Only a pinned note can be unpinned", {"noteId": note_id})


class CannotShareWithSelfException(NoteDomainException):
    def __init__(self, note_id: str) -> None:
        super().__init__("CannotShareWithSelf", "You already own this note", {"noteId": note_id})


class NoteAlreadySharedException(NoteDomainException):
    def __init__(self, note_id: str, recipient_id: str) -> None:
        super().__init__(
            "NoteAlreadyShared",
            "This note is already shared with that account",
            {"noteId": note_id, "recipientId": recipient_id},
        )


class RecipientNotFoundException(NoteDomainException):
    def __init__(self, note_id: str, recipient_id: str) -> None:
        super().__init__(
            "RecipientNotFound",
            "There is no account to share this note with",
            {"noteId": note_id, "recipientId": recipient_id},
        )
