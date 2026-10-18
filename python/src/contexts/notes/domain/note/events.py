"""Domain events are facts, named in the past tense, raised by the ``Note`` aggregate when
something meaningful happened. They carry just enough data for a listener to react.

They stay inside the Notes context. When another context must know, an application handler
translates them into an integration event (see application/events)."""

from dataclasses import dataclass

from architecture.domain.event import DomainEvent


@dataclass(frozen=True)
class NoteCreatedEvent(DomainEvent):
    note_id: str
    owner_id: str
    title: str


@dataclass(frozen=True)
class NoteEditedEvent(DomainEvent):
    note_id: str
    title: str


@dataclass(frozen=True)
class NoteArchivedEvent(DomainEvent):
    note_id: str


@dataclass(frozen=True)
class NoteRestoredEvent(DomainEvent):
    note_id: str


@dataclass(frozen=True)
class NoteSharedEvent(DomainEvent):
    note_id: str
    title: str
    owner_id: str
    recipient_id: str
