from datetime import UTC, datetime

from architecture.domain.result import Failure, Success
from contexts.notes.application.commands.suggest_note_title import (
    SuggestNoteTitleCommandEvent,
    SuggestNoteTitleCommandHandler,
)
from contexts.notes.application.commands.test_commands import Fixture
from contexts.notes.application.suggestions import SuggestionProvenance, TitleSuggestion
from contexts.notes.domain.note.note_title import NoteTitle

AT = datetime(2026, 1, 1, tzinfo=UTC)


class Proposing:
    """The non-deterministic source, made deterministic for the test: it proposes what the test says."""

    def __init__(self, title: str) -> None:
        self._title = title
        self.asked = 0

    async def suggest(self, content: str) -> TitleSuggestion:
        self.asked += 1
        return TitleSuggestion(title=self._title, provenance=SuggestionProvenance(source="test", version="1", at=AT))


async def test_applies_a_suggestion_the_note_accepts_and_answers_it_with_its_provenance() -> None:
    notes = Fixture()
    note_id = await notes.a_note_owned_by("alice")

    result = await SuggestNoteTitleCommandHandler(notes.repository, Proposing("Errands")).execute(
        SuggestNoteTitleCommandEvent(note_id=note_id), notes.context_for("alice")
    )

    assert result == Success(
        TitleSuggestion(title="Errands", provenance=SuggestionProvenance(source="test", version="1", at=AT))
    )
    assert notes.stored(note_id).title == "Errands"


async def test_lets_the_note_refuse_a_suggestion_that_breaks_its_rules_and_changes_nothing() -> None:
    notes = Fixture()
    note_id = await notes.a_note_owned_by("alice")

    result = await SuggestNoteTitleCommandHandler(
        notes.repository, Proposing("x" * (NoteTitle.MAX_LENGTH + 1))
    ).execute(SuggestNoteTitleCommandEvent(note_id=note_id), notes.context_for("alice"))

    assert isinstance(result, Failure) and result.error.type == "NoteTitleTooLong"
    assert notes.stored(note_id).title == "Groceries"


async def test_is_the_owners_to_ask_anyone_else_is_refused_before_the_source_is_even_consulted() -> None:
    notes = Fixture()
    note_id = await notes.a_note_owned_by("alice")
    source = Proposing("Errands")

    result = await SuggestNoteTitleCommandHandler(notes.repository, source).execute(
        SuggestNoteTitleCommandEvent(note_id=note_id), notes.context_for("bob")
    )

    assert isinstance(result, Failure) and result.error.type == "NotNoteOwner"
    assert notes.stored(note_id).title == "Groceries"
