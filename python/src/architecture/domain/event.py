"""Event: a named, immutable payload. Every message in the system is one.

The three kinds share one shape and differ in intent, which is why they are distinct classes: a
handler, a bus decorator or a test can tell them apart with ``isinstance``.

- CommandEvent      asks for something to happen; one handler, may be refused.
                    ``CreateNoteCommandEvent``, published by a controller, answered with an operation id.
- DomainEvent       states that something happened inside a context; recorded by an aggregate,
                    published after commit, any number of handlers. ``NoteSharedEvent``.
- IntegrationEvent  tells other contexts about it; the published contract of a context, kept in
                    shared_kernel/application/integration_events. ``NoteSharedIntegrationEvent``.

An event is a frozen dataclass whose fields are its payload; its name is its class name, which
is the channel the bus routes on, and ``name_of()`` reads it from a class or an instance, so a
payload may have a field called ``name``::

    @dataclass(frozen=True)
    class NoteSharedEvent(DomainEvent):
        note_id: str
        recipient_id: str

Being a dataclass, an event compares by value: a test that asserts
``note.pull_domain_events() == [NoteSharedEvent(note_id="n1", recipient_id="bob")]`` compares
every field.
"""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Event:
    pass


def name_of(event: Event | type[Event]) -> str:
    """The name the bus routes on: the event's class name, from the class or from an instance."""
    return event.__name__ if isinstance(event, type) else type(event).__name__


def public_name_of(event: Event | type[Event]) -> str:
    """The name a message has outside the process, on an operation record or in a completion
    notice: its intent or its fact, without the suffix that names its kind here (``ShareNote``,
    ``NoteShared``, ``OperationComplete``). The bus keeps routing on the full name; the suffix is
    this codebase's naming convention, and every language answers the same API (API-ONE-SURFACE)."""
    return re.sub(r"(CommandEvent|IntegrationEvent|Event)$", "", name_of(event))


@dataclass(frozen=True)
class CommandEvent(Event):
    """A request that something happen; one handler, may be refused."""


@dataclass(frozen=True)
class DomainEvent(Event):
    """A fact that happened inside a context; recorded by an aggregate, published after commit."""


@dataclass(frozen=True)
class IntegrationEvent(Event):
    """A fact restated for other contexts: a context's published contract, kept in the shared kernel."""
