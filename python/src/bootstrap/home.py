"""The home of the API, in two formats: ``{ name, version }`` for an API client, the page shell
for the HTMX front end, which then loads the account. The one controller the composition root
owns, with its presenters beside it; and the health check."""

from dataclasses import dataclass
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse, Response

from architecture.presentation.format import ByFormat, format_of, html


@dataclass(frozen=True)
class HomeViewModel:
    name: str
    version: str


class HomeJsonPresenter:
    def present(self, data: HomeViewModel) -> Response:
        return JSONResponse({"name": data.name, "version": data.version})


class HomeHtmxPresenter:
    def present(self, data: HomeViewModel) -> Response:
        return html(f"""
            <main
              hx-trigger="load" hx-get="/v1/auth/me" hx-swap="innerHTML" hx-ext="response-targets,ws" hx-target="#app"
            >
              <h1>{data.name}</h1>
              <p><b>Version:</b> {data.version}</p>
              <div id="app"></div>
            </main>
        """)


HOME: ByFormat[HomeViewModel] = ByFormat(json=HomeJsonPresenter(), htmx=HomeHtmxPresenter())


def home_routes(home: HomeViewModel) -> APIRouter:
    router = APIRouter(tags=["home"])

    @router.get("")
    async def get_home(request: Request) -> Response:
        return HOME.present(format_of(request.headers), home)

    @router.get("/health")
    async def health() -> Response:
        return JSONResponse({"status": "ok", "timestamp": datetime.now(UTC).isoformat()})

    return router
