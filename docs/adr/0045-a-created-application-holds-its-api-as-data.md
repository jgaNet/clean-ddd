# 45. A created application holds its API as data, and its end-to-end tests hold every answer to it

## Context

Every triaged failure of J5 and J5b was about what a request specified — a shape, a meaning, a status — and each
was a convention born early, untested where it was born, and required late ([ADR 41](0041-an-operation-read-is-in-the-contract.md),
[the kit standard](../evaluations/benchmark/kit-standard.md)). The kit standard fixed that for the benchmark's hidden
tests: a kit carries its requests' API as fragments of JSON Schema, composed in order, and the kit's client holds
every answer it reads to them, naming the request whose shape an answer breaks. The application itself did not have
it: its shape lived in the route schemas and the read models, where a habit drifts from what the requests say, and
an agent learned the departure from a hidden test, if at all.

[RFC 0005](../rfc/0005-what-the-literature-and-j5b-say-before-j6.md) proposed (P2) that the specification be data in
the application, held by its own tests, and the maintainer took it (D2): in TypeScript before J6, the other languages
after.

## Decision

- **A created application has `api/`,** one fragment per change, `api/<n>-<name>.yaml`, composed in their order, in
  the kit's format (`resources` with `schema`, `gains`, `states`, `conditions`; `routes` by status; `all_routes`;
  `$resource`). `create` writes the first, `api/1-the-api.yaml`, and `api/README.md`, which says the format:
  - Full: what any route may answer (`202: accepted`, `{ operationId }`, and `4xx: refusal`, `{ message }`), the
    `operation` resource and the Tracker's two routes. The operation is **generated from the contract's
    `http.operation` record** when the application is created, so the Tracker's record, the contract and the
    application's tests are one record (ADR 41).
  - Lite: answers at once, and its fragment says so: no operation and no `202`, a `created` resource
    (`201 { id }`) for its creates, and `4xx: refusal` (`{ message }`, with the rule's `type`).
- **One composer, in the tooling.** The composition and the check of an answer move from
  `.claude/flow/api-schema.mjs` into the package (`tools/src/api.ts`, exported from `clean-ddd` and, alone, as
  `clean-ddd/api`). The flow's file keeps its names and its behaviour, reading the source in a checkout and the
  installed package elsewhere; a kit composes byte for byte as before.
- **The end-to-end tests hold every answer to it.** A created application's suites speak through one client,
  `apiClient()` in `src/Bootstrap/Fastify/api.spec-helper.ts`, copied from the reference like the starters it serves.
  It holds every answer it reads to the composed API, and a test fails on an answer of another shape, on a status
  neither its route nor `all_routes` names, and — stricter than a kit — on a route no fragment declares, each
  problem naming the fragment whose shape it breaks:
  ```
  GET /v1/tracker/operations/… answered 200: the body should have required property 'createdAt' (request 1), the shape api/1-the-api.yaml gives
  ```
  The starters' suites read an operation answered `200`, so the first fragment is held from the first run.
- **The check reads it.** `clean-ddd check` refuses an `api/` that does not compose, under API-ONE-SURFACE, each
  problem naming its fragment: a file that does not parse or is not a fragment, a route answered with a resource no
  fragment defines, a `$resource` nothing defines, a change composition cannot make.
- **A change writes its fragment first.** The guide says it in one line, and the `command` and `query` checklists of
  the TypeScript binding, Full and Lite, start with it.
- **Route schemas do not read it yet.** Fastify's response schemas filter what they serialize: a field the schema
  does not list is dropped. Generating them from `api/` would make the two one, and is left for later; until then a
  read model, its route schema and its fragment change together, and the end-to-end client catches the one left
  behind.

## Status of the implementation

- **The tooling:** `tools/src/api.ts` and its spec; `create` writes the fragment and the README where the binding
  copies the client; the check's step 15; the package's `./api` export and its bundle.
- **The TypeScript binding:** both `create` lists copy the client; the checklists' first step.
- **The reference's `typescript/` tree:** only what created applications share — the client, and the two starters'
  suites, which speak through it. The reference has no `api/`, so its client holds nothing there: the shared
  scenario holds the reference from outside (ADR 16), as before.
- **The flow:** `api-schema.mjs` reads the tooling; the prose control arm, whose tooling is taken out, loses `api/`
  with it.
- **Rust, Python and Go:** after J6 (D2). Their `create` writes no `api/`; the check would hold one if it were there.

## Consequences

- **An agent in a created application meets a departure from the specification in its own suite,** at the change
  that makes it, named by the fragment, rather than in a hidden test or a late request (RFC 0005, H2).
- **A change that adds an answer costs a fragment,** written before its code, and a route answered without one fails.
- **The first fragment depends on the contract at the time of `create`;** a later change to `http.operation` reaches
  an application as a fragment it writes, as any other change does.
- **A created application needs a `clean-ddd` that ships `clean-ddd/api`:** a vendored tarball of the tooling taken
  before this decision makes its end-to-end suites fail on the import.

## When to revisit

- When the route schemas are generated from `api/`, and the read model's schema is said once.
- When J6 is read: if failures of specified conventions remain in the arms that have `api/`, H2 is refuted and the
  cost of the fragments is not paid back.
