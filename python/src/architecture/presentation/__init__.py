"""The building blocks' Presentation: the two ways a controller answers, and nothing a context
would call vocabulary.

- A command is **accepted**: ``accept()`` publishes it, answers ``202 { operationId }`` at once,
  and the dispatch runs as a task after the response has left (ADR 14). The client follows the
  operation through the Tracker.
- A query answers synchronously, and a refused one is a **refusal**: the exception's kind
  decides the status (``status_of()``: not allowed 403, not found 404, anything else 400) and
  the body carries its message (``refuse()``). A context maps its own kinds first (a
  ``NoteNotFound`` is a 404) and falls back on this.
- A use case may answer in **several formats**: JSON for API clients, HTML fragments for the
  HTMX front end. ``format_of()`` reads which one a request wants, and a controller keeps one
  ``Presenter`` per format in a ``ByFormat``: JSON mandatory, HTMX optional, falling back on
  JSON; a plain value the controller owns, nothing registered or looked up by name.

The per-request ``ExecutionContext`` reaches a controller through ``context_of(request)``,
which reads what the composition root's middleware put on the request: a controller never
builds one, never builds an adapter, and gets its ``Module`` from the composition root
(ARCH-PRESENTATION).
"""

from architecture.presentation.format import ByFormat, Format, Presenter, format_of, html
from architecture.presentation.http import accept, context_of, jsonable, refuse, status_of

__all__ = [
    "ByFormat",
    "Format",
    "Presenter",
    "accept",
    "context_of",
    "format_of",
    "html",
    "jsonable",
    "refuse",
    "status_of",
]
