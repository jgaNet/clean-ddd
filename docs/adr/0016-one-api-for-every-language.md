# 16. One API for every language: a shared black-box scenario is the executable contract

## Context

ADR 11 made the reference one application written in several languages, held to one contract (`conventions/architecture.yaml`) through a binding per language. The contract holds the layers, the dependency table, the rules and the HTTP grammar; the conventions check of each language holds its tree to them. What the contract did not hold was the API itself: the routes, the status codes, the body shapes, the names a client reads on an operation record.

The third language made the gap visible. Each implementation had its own end-to-end suite, written in its own test framework and booting its own application in-process, and the three suites had drifted on the one thing a client sees: the TypeScript and Python Trackers recorded an operation under its class name (`ShareNoteCommandEvent`, `NotificationFailedEvent`), the Rust one under its intent (`ShareNote`, `NotificationFailed`); the completion notice a browser receives carried the same difference in its title. Each suite passed, because each asserted its own server. Nothing ran the same client against the three.

The front end was the same story in miniature: three identical copies of the HTMX page, one per bootstrap, that only stayed identical because nobody had touched them.

## Decision

**The API is one surface, and a black-box scenario is its executable contract.** [`api/scenario.mjs`](../../api/scenario.mjs) is a dependency-free Node script that takes a base URL and walks the application as a client would: the home in two formats, health, the front end, login and sign-up through validation, a note created, edited, archived, restored, titled by suggestion, shared with a second account and refused for an unknown one, the operations the Tracker records and who may read them, the inbox and what marking a notification read does, the live channel over the websocket, the HTMX fragments the page loads. It asserts status codes, body shapes and public names, and nothing about the implementation. CI starts each language's server and runs the same script against it; a difference between the servers is a failing step that names the server.

**The public name of an operation is its intent or its fact, without the suffix of its kind.** A client reads `ShareNote` and `NoteShared`, never `ShareNoteCommandEvent`: the suffix is this codebase's way of naming its building blocks, and it has no meaning outside the process. The bus keeps routing on the full name; the stripping happens where the record is projected for a client (the Tracker's projection, the completion notice), in a helper beside `Event` (`publicName()` in TypeScript, `public_name_of()` in Python; Rust names its messages that way to begin with).

**The front end is one folder at the repository root** (`web/`). It is the scenario's live client: if the page works against one server, it works against the others. (It was first served by every bootstrap; [ADR 17](0017-the-front-end-is-a-client-served-elsewhere.md) makes it a client served elsewhere.)

The rule is **API-ONE-SURFACE**, enforced by tests — the scenario — and shown in each binding by the Tracker's projection and the end-to-end suite that asserts the public names.

## Consequences

- A change to the API is made three times, and the scenario says when one is missing: a route added to one server fails the scenario against the other two until they have it. That is the cost of one surface, and it is the point: the languages are not allowed to diverge on what a client sees.
- The per-language end-to-end suites stay. They boot the application in-process, run with the language's own test runner and are where a feature is proved first; the scenario is the cross-check a reader runs once, against a server already up, and that CI runs on every change. Both assert the public names, so a drift on them fails in two places.
- The scenario is plain JavaScript on the platform's `fetch` and `WebSocket`, with no package and no build, so the Rust and Python jobs need Node and nothing else; it lives at the root because it belongs to no language. It is not TypeScript and is not held by the TypeScript tooling: the trade is a script a Rust or Python reader can run and read without `yarn install`.
- A client written against one server (the front end, a mobile application, an agent) is portable to the others by construction, which is what a reference in several languages owes its readers.

## When to revisit

If the scenario grows a branch per language (`if (server === 'rust')`), the surface has split and this record has failed: either the difference is a bug to fix in the differing server, or the API has a legitimate variant that belongs in the contract as data, with the scenario reading it. If the scenario and the end-to-end suites start asserting different shapes for the same route, one of them is wrong and the scenario wins.
