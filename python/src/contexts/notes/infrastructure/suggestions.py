"""The local adapter of NoteTitleSuggestions: the first line of the content, as it is. It is a
heuristic standing where a model would stand; an LLM adapter implements the same port and
nothing else changes. On purpose it does not trim its proposal to NoteTitle's rules: a blank
first line or a very long one is proposed as such, and the aggregate refuses it, which is the
point of ADR 7."""

from datetime import UTC, datetime

from contexts.notes.application.suggestions import SuggestionProvenance, TitleSuggestion


class FirstLineTitleSuggestions:
    VERSION = "first-line/1"

    async def suggest(self, content: str) -> TitleSuggestion:
        first_line = content.split("\n", 1)[0]
        return TitleSuggestion(
            title=first_line.strip(),
            provenance=SuggestionProvenance(source="heuristic", version=self.VERSION, at=datetime.now(UTC)),
        )
