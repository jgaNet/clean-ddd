"""The port for a decision the domain cannot make from its own state: what a note should be
called, given its content. Its answer is not reproducible from the business state alone (a
model, a heuristic, a person may all stand behind it), so it enters the domain as a value the
aggregate validates and may refuse. Named for what it decides, not for the technology (ADR 7,
DOMAIN-NON-DETERMINISM).

The provenance is kept with the suggestion so that an accepted one can be traced back: which
source, which version of it, when. An LLM adapter would put the model and the prompt version
here; the rule-based adapter puts its rule.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class SuggestionProvenance:
    source: str
    version: str
    at: datetime


@dataclass(frozen=True)
class TitleSuggestion:
    """What the source proposes. Whether the note accepts it is the aggregate's decision."""

    title: str
    provenance: SuggestionProvenance


class NoteTitleSuggestions(Protocol):
    async def suggest(self, content: str) -> TitleSuggestion: ...
