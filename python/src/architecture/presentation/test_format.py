from starlette.responses import JSONResponse, Response

from architecture.presentation.format import ByFormat, Format, format_of, html


class Json:
    def present(self, data: str) -> Response:
        return JSONResponse({"greeting": data})


class Htmx:
    def present(self, data: str) -> Response:
        return html(f"<p>{data}</p>")


def test_reads_the_format_from_the_htmx_header() -> None:
    assert format_of({"hx-request": "true"}) is Format.HTMX
    assert format_of({}) is Format.JSON


def test_falls_back_on_json_when_a_use_case_has_no_htmx_presenter() -> None:
    both = ByFormat(json=Json(), htmx=Htmx())
    only_json = ByFormat(json=Json())

    assert both.present(Format.HTMX, "hi").body == b"<p>hi</p>"
    assert only_json.present(Format.HTMX, "hi").media_type == "application/json"
