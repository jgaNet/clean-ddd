"""The lifecycle of a note. A note starts ACTIVE, can be ARCHIVED, and can come back. The
transitions themselves are enforced by the ``Note`` aggregate, not by this enum."""

from enum import StrEnum


class NoteStatus(StrEnum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
