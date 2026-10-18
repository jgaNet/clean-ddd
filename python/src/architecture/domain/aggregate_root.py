"""AggregateRoot is the entry point of an aggregate: a cluster of objects that must always be
consistent together and that is loaded and saved as a whole.

On top of the identity inherited from Entity, an aggregate root records the domain events
raised by its own behaviour. The domain decides *that* something happened; the application
layer decides *when* to publish it (after the aggregate is saved).

It also carries the **version** it was loaded with, so that a repository can refuse to save it
over a newer one: two writers who read the same version cannot both win (ADR 8). A new
aggregate is version 0; the repository stores version + 1 on every save. The aggregate never
changes its own version: it is a fact about what was read, not about what happened.

Usage:
- inside a behaviour method: ``self._record(NoteArchivedEvent(note_id=...))``
- inside a command handler, once saved: ``await publish_domain_events(note, context)``

See Note (contexts/notes/domain/note/note.py) for a complete example.
"""

from architecture.domain.entity import Entity
from architecture.domain.event import DomainEvent
from architecture.domain.id import Id


class AggregateRoot(Entity):
    __slots__ = ("_domain_events", "_version")

    def __init__(self, id: Id, version: int = 0) -> None:  # noqa: A002
        super().__init__(id)
        self._version = version
        self._domain_events: list[DomainEvent] = []

    @property
    def version(self) -> int:
        """The version this aggregate was loaded with (0 when it was just created)."""
        return self._version

    def _record(self, event: DomainEvent) -> None:
        """Only an aggregate root records, from inside a behaviour (DOMAIN-RECORDS-EVENTS)."""
        self._domain_events.append(event)

    def pull_domain_events(self) -> list[DomainEvent]:
        """The facts recorded since the last pull; a command handler publishes them after saving."""
        events = self._domain_events
        self._domain_events = []
        return events
