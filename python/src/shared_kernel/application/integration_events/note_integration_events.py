"""The published contract of the Notes context: what other contexts may know about notes.

It is deliberately not the NoteSharedEvent of the Notes domain. A domain event can change
whenever the Note aggregate changes; an integration event is a promise to other contexts and
evolves with care. Notes translates one into the other (its NoteSharedHandler); the receiving
context reads only this.
"""

from dataclasses import dataclass

from architecture.domain.event import IntegrationEvent


@dataclass(frozen=True)
class NoteSharedIntegrationEvent(IntegrationEvent):
    note_id: str
    title: str
    owner_id: str
    recipient_id: str
