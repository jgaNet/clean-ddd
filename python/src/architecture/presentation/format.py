"""The two ways this application answers: JSON for API clients, HTML fragments for the HTMX
front end, decided per request from the ``HX-Request`` header."""

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from textwrap import dedent
from typing import Protocol

from starlette.responses import HTMLResponse, Response


class Format(StrEnum):
    JSON = "json"
    HTMX = "htmx"


def format_of(headers: Mapping[str, str]) -> Format:
    return Format.HTMX if headers.get("hx-request") else Format.JSON


class Presenter[T](Protocol):
    """Turns a view model into a response, in one format."""

    def present(self, data: T) -> Response: ...


@dataclass(frozen=True)
class ByFormat[T]:
    """One presenter per format for a given view model. JSON is mandatory (every use case has an
    API); HTMX is optional and falls back to JSON."""

    json: Presenter[T]
    htmx: Presenter[T] | None = None

    def present(self, format: Format, data: T) -> Response:
        presenter = self.htmx if format is Format.HTMX and self.htmx is not None else self.json
        return presenter.present(data)


def html(fragment: str, status_code: int = 200) -> HTMLResponse:
    """An HTML fragment as a response, its indentation removed."""
    return HTMLResponse(dedent(fragment).strip(), status_code=status_code)
