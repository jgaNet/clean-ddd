# 17. The front end is a client served elsewhere: no page in the API, a bearer token, CORS

## Context

Until now each bootstrap served the HTMX front end beside its API: the page at `/`, the scripts under `/js`, `index.html` for any path the API did not answer. ADR 16 reduced the three copies to one folder, but the folder was still the API's to serve, and the page relied on it: relative URLs for `/v1/…` and the websocket, a `SameSite=Strict` cookie for the session, a fallback route in every composition root.

A reference whose API is one surface for three languages (API-ONE-SURFACE) should also be consumable from anywhere: a front end served by nginx, a bucket, a CDN, or another front end altogether. And a question was asked plainly: can the front end be an independent static site, with no relation to `typescript/`, `rust/` or `python/`?

## Decision

**The API serves no page.** The three composition roots serve the routes under `/v1` and the websocket at `/ws`, and nothing else; an unknown path is a 404. The static-file plugins and the fallback routes are gone.

**`web/` holds the front ends, one folder each, and any static server serves them.** `web/htmx/` is the HTMX one; a second kind of front end would be a sibling folder. `web/serve.mjs` is a dependency-free static server for development (a folder, `index.html` for the front end's own routes, the API base filled in); in production nginx, Caddy or a bucket do the same.

**The page talks to the API as an API client does.** One script, `web/htmx/js/api.js`, holds everything the page knows about the API: the base read from `<meta name="api-base">` (empty: the same origin, behind one reverse proxy), prefixed to every `/v1/…` request; the websocket opened on the API's host with the token in the query; the token taken from the fragment the login answers (`data-token`), kept in `localStorage`, sent as `Authorization: Bearer`, forgotten on logout. The cookie stays, for a deployment on one origin; it is no longer what the page depends on.

**CORS for the origins the settings name.** `WEB_ORIGINS` (comma-separated) lists the origins a front end is served from; the API allows them, every method, the `authorization`, `content-type` and `hx-*` headers, and exposes `x-trace-id`. With no origin listed, the API answers same-origin clients only. No credentials mode: the token travels as a header, not a cookie.

The shared scenario checks this surface too: the API has no page, a preflight from the configured origin is allowed and an unknown one is not, the login fragment carries the token. CI starts each server with `WEB_ORIGINS` set and passes `--origin`, and serves `web/htmx` once with `serve.mjs` to prove the folder stands alone.

## Consequences

- The front end has no relation to any language's directory: no server knows where the page is, and the page knows the API only through one `<meta>`. Deploying the front end is copying a folder; pointing it at a server is editing one line.
- What the API still knows of HTMX is the fragments its presenters render for an `HX-Request` — the presenters-by-format example the reference teaches. That is a relation to the HTMX *protocol*, not to the folder; a JSON-only client (the scenario, a mobile application) never sees it. Replacing HTMX with a client-rendered front end would remove the HTMX presenters and is a separate decision.
- The token appears in a fragment the API renders. It already appeared in the JSON answer of the same route; a page that holds a token in `localStorage` is the standard trade of a front end on another origin, and the alternative (`SameSite=None` cookies with credentialed CORS) ties the API to the browser's cookie rules for every client.
- Three settings, three CORS configurations, in the frameworks' own words (`@fastify/cors`, `tower_http::cors`, Starlette's `CORSMiddleware`), under one env variable name. The scenario is what keeps them answering the same headers.

## When to revisit

If a deployment needs the front end and the API on one origin only, nothing here is in the way: an empty `api-base` and no `WEB_ORIGINS` is that deployment. If a front end needs more than a bearer token and CORS (a session cookie across subdomains, a BFF), that is a new decision about the client, not a reason to put the page back in the API.
