# One API, for every language

The three implementations answer the same HTTP API — the same routes under `/v1`, the same status codes, the same body shapes, the same public names on an operation record — and [`scenario.mjs`](scenario.mjs) is that promise made executable (rule **API-ONE-SURFACE**, [ADR 16](../docs/adr/0016-one-api-for-every-language.md)). It is a black-box client: it walks a running server the way a browser or an API client would, and asserts nothing about how the server is written.

```bash
node api/scenario.mjs http://127.0.0.1:10000            # against whichever server is up
node api/scenario.mjs http://127.0.0.1:10000 --admin admin@admin.fr:admin --origin http://127.0.0.1:8080   # the origin the front end is served from (WEB_ORIGINS on the server)
```

Plain Node ≥ 22, no package, no build: `fetch` and `WebSocket` are the platform's. Start a server first (`yarn start:dev` in `typescript/`, `cargo run -p bootstrap` in `rust/`, `uv run python -m bootstrap` in `python/`, each on `:10000` by default); the scenario signs up its own accounts under a fresh suffix, so it runs against a server that already holds data, and more than once. The first failing step stops the run and prints what differed; the exit code is the verdict. CI runs it against each language's server on every change.

## What it walks

| Section | What a client may rely on |
|---|---|
| Home and health | `GET /v1` → `{ name, version }`, or the page shell to an `HX-Request`; `GET /v1/health` → `{ status: "ok" }` |
| A front end on another origin | the API has no page (`/me`, `/js/…` are 404); with `--origin <url>`, a preflight from that origin is allowed, `authorization` and the `hx-*` headers with it, `x-trace-id` exposed, an unknown origin refused |
| Authentication | `POST /v1/auth/login` → 200 `{ token }` and a `token=` cookie, 401 otherwise; `GET /v1/auth/me` → 401 anonymous or forged, the account otherwise |
| Sign-up and validation | `POST /v1/auth/signup` → 202, the operation named `SignUp`, `AccountAlreadyExists` on the operation, the id in `result`, no payload on the record; a `PENDING` account cannot log in; `GET /v1/auth/accounts/:id/validate` is `NotAllowed` for an anonymous caller and `ValidateAccount` → `SUCCESS` for an administrator; a user reads their own account (200), not another's (403); a login is never an operation |
| Notes | `GET /v1/notes` (403 anonymous), `POST` (`CreateNote`, the id in `result`), the list item `{ id, title, status }`, the detail `{ id, title, status, ownerId, content, sharedWith }`, `PUT` (`EditNote`), `/archive`, `/restore`, `NoteArchived` on an edit while archived, 404 for an unknown note and for one the caller may not see, `/suggest-title` with its provenance and `NoteTitleTooLong`, `/share` with `RecipientNotFound`, `CannotShareWithSelf`, `NoteAlreadyShared`, `GET /v1/notes/shared` and the notice the recipient gets |
| Tracker | `GET /v1/tracker/operations` is an administrator's (403 otherwise), `?traceId=` lists what a command set off under one trace; an operation is read by its caller or an administrator, 404 otherwise; the record carries no `context` and no `payload` |
| Notifications | the inbox `{ total, unread, notifications }`, items without `attempts`, the two welcome emails `SENT`, the share notice `FAILED` over a websocket the recipient was not on; `PATCH /:id/read` (`MarkAsReadNotification`, `NotificationAlreadyRead` the second time) and the outcome notice it produces; an inbox is private (403), `POST /v1/notifications` is an administrator's (`NotAllowed` on the operation), an email delivered to the address the metadata carries; `?onlyUnread=true` |
| The live channel | `/ws?token=` receives an HTMX fragment (`id="notifications"`) announcing the outcome of a command; an anonymous connection is closed |
| The HTMX fragments | the login form, the fragment that loads the account after a login through the form (carrying the token, for a page on another origin), the alert on a refusal, the account page, the new-note form, the logout |

The public name of an operation is its intent or its fact without the suffix of its kind (`ShareNote`, not `ShareNoteCommandEvent`); the Tracker's projection strips it in every language. Not part of the surface: what the framework answers to a malformed body (`400` from Fastify, `422` from FastAPI and axum) — the scenario sends well-formed bodies only, and a refusal the domain makes is on the operation, not in a status code.

## Changing it

A step is a promise to every client, so a new one is added when the API gains something every language answers, and it fails against the servers that do not yet — that is what it is for. Fix the server that differs, never the step; a difference that turns out to be legitimate belongs in the contract as data, not in a branch per language here (ADR 16, *When to revisit*).
