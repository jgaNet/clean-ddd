# The front ends

One folder per front end, each a client of the API every language answers ([ADR 17](../docs/adr/0017-the-front-end-is-a-client-served-elsewhere.md)). No server of `typescript/`, `rust/` or `python/` serves them or knows them: a folder here is static files, served by any static server, talking to the API through CORS with a bearer token.

| Folder | What it is |
|---|---|
| [`htmx/`](htmx) | the HTMX front end: one page, htmx and its extensions, and [`js/api.js`](htmx/js/api.js), the one script that knows where the API is and how to talk to it |

## Running one

```bash
# an API, whichever language, told which origin the page will come from
WEB_ORIGINS=http://127.0.0.1:8080 yarn --cwd typescript start:dev          # or: cargo run -p bootstrap (rust/), uv run python -m bootstrap (python/)
# the page, from any static server; this one is plain Node, no package
node web/serve.mjs web/htmx --port 8080 --api http://127.0.0.1:10000
```

Then open `http://127.0.0.1:8080`. `serve.mjs` serves the folder, answers `index.html` to the front end's own routes (`/me`), and fills the page's `<meta name="api-base">` with `--api`. In production any static server does the same (nginx `try_files $uri /index.html`, Caddy `try_files {path} /index.html`, a bucket's index document), with the meta edited once at deploy time. An empty `api-base` means the API is on the page's origin, behind one reverse proxy; `WEB_ORIGINS` is then unnecessary.

## What the page knows about the API

Everything is in [`htmx/js/api.js`](htmx/js/api.js), loaded right after htmx:

- every HTMX request to `/v1/…` is prefixed with the base and carries `Authorization: Bearer <token>`;
- the websocket (`ws-connect="/ws"`) opens on the API's host with `?token=`, since a cookie does not cross origins;
- the token comes from the fragment the login answers (`data-token`), lives in `localStorage`, and is forgotten on logout.

The API, for its part, renders HTML fragments to an `HX-Request` (the presenters by format each language shows) and allows the origins `WEB_ORIGINS` lists. That is the whole relation.

## Adding a front end

A sibling folder, a line in the table above, and nothing in any language's directory. It talks to the API the scenario in [`api/`](../api) describes; if it needs something the API does not answer, that is an API change, made in the three languages and in the scenario first.
