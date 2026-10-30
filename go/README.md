# Clean Architecture & DDD, the Go implementation

The Go rendering of the [reference](../README.md): the same application, the same architecture ([`conventions/`](../conventions/README.md)), the same decisions ([`docs/adr`](../docs/adr)), under the same rules and the same ids. This page is about this directory, and every command on it runs from here.

**What is here today**: the whole application, every concept of the [map](../README.md#the-map-concept--language) included: the four contexts, every layer of each, the composition root that serves them, and the tool that holds this language to the contract. **Notes**: the `Note` aggregate with everything around it, its commands, its queries and its reactions, an in-memory and a SQLite adapter behind the same ports held to one contract test, the REST routes. **Security**: the `Account` aggregate, sign-up, login, validation and the administrator's registration, bcrypt and JSON Web Tokens behind their ports, the middleware that identifies the caller of every request, the routes in JSON and HTMX. **Tracker**: a projection of every operation the bus carries, through a decorator of the bus, and the routes a client polls after a `202`. **Notifications**: the `Notification` aggregate with its child entity (the delivery attempts) and its strategy, the delivery service every entry point ends in, the anti-corruption handlers on the other contexts' contracts, the email channel (logged) and the websocket channel, the inbox routes. **The bootstrap**: the transport, which knows no context (`net/http`, one execution context per request, CORS for the front end's origin, the routes under one API prefix), the settings and the composition root on it (Security's authentication, the websocket beside the API, the seed), the composition a created application starts from (the Tracker alone, with its own end-to-end suite), the entry point, and the end-to-end suites that boot it on a free port. It was written in one pass, with the shared API scenario ([`api/`](../api)) as the finishing line; the fresh-agent evaluation of the guide is what remains.

- [Where the decisions land in Go](#where-the-decisions-land-in-go)
- [The map: concept → file](#the-map-concept--file)
- [The rules, and how they are enforced](#the-rules-and-how-they-are-enforced)
- [Layout](#layout)
- [Running it](#running-it)
- [Vocabulary](#vocabulary) · [Known gaps](#known-gaps)

## Where the decisions land in Go

The decisions are the architecture's, so they hold here; the idiom changes how some of them read, and [ADR 18](../docs/adr/0018-in-go-a-layer-is-a-package-and-a-refusal-is-an-error-value.md) records the choices below.

- **A refusal is a value, never thrown** ([ADR 1](../docs/adr/0001-result-instead-of-exceptions.md)): the `(T, error)` pair is Go's `Result`, and the error a behaviour returns is a [`*domain.Exception`](architecture/domain/exception.go) (service, type, message, context), read with `domain.Refusal(err)` — which is what TypeScript wrote as `if (r.isFailure()) return r;` and Go writes as `if err != nil { return zero, err }` ([`result.go`](architecture/domain/result.go) says so where a `Result` type would be). A `panic` is for a programming error and corrupted state only; the base handlers recover one into a failed operation.
- **Reconstitution throws on corrupted data** ([ADR 4](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md)): `note.FromSnapshot` panics, with the note's id in the message.
- **Layers are packages, and the dependency table is held by a `go/parser` walk.** A tree is a directory of the module (`architecture`, `sharedkernel`, `contexts/<context>`, `bootstrap`), a layer a package directory named after the contract's layer in lowercase, and a file imports a package by its module path. The compiler holds no boundary between the packages of one module, so [`tools/conventions`](tools/conventions/main.go) reads every import of every file — never building it — and holds it to its row of the table, naming the rule it breaks; it is the linter and the check in one, and `can-import` answers before an import is written. A Go import path is always absolute: ARCH-RELATIVE has nothing to refuse here.
- **Composition, where TypeScript inherits.** An aggregate *embeds* [`AggregateRoot`](architecture/domain/aggregate_root.go); its state stays in unexported fields behind methods, and `Record()` is exported because the aggregate lives in its own package — that only a behaviour calls it is the rule, not the compiler's. A value object is a struct with one unexported field and a constructor returning `(T, error)`: the unexported field keeps the rule, the struct's `==` is the equality. An event is a struct embedding the marker of its kind ([`event.go`](architecture/domain/event.go)), its exported fields the payload and its type name the channel, read by `domain.NameOf()`.
- **Generic functions, where TypeScript has template methods.** A handler is a struct with `Execute()`; [`application.Run()`](architecture/application/command_handler.go) is the template for a command (guard, log, transaction, safety net), `application.Query()` for a query, and `application.Command()` / `application.Reaction()` build the subscription that puts a handler on the bus under its event's type name. A module finds a handler by its type (`application.QueryOf[*GetNoteHandler]`, applied to the module), as the other languages do by class.
- **Ports are interfaces in the aggregate package** ([`repository.go`](contexts/notes/domain/note/repository.go)), implemented structurally, so an adapter may be an in-memory store or a database behind the same interface, and a test hands a domain service a five-line type. `go vet` and the compiler are the type check the contract's `types` enforcement word stands for.
- **Publishing starts a goroutine; `Settle()` waits for it** ([ADR 14](../docs/adr/0014-in-rust-the-transport-spawns-the-dispatch-and-finds-handlers-by-their-message.md), which holds here as it does in Rust and Python): `Publish()` builds the operation and starts its `Dispatch()` in a goroutine, so a route answers `202 { operationId }` before the handling; the in-memory bus's `Settle()` waits for what is in flight, which is what a test calls to see what the handlers did. The execution context guards its after-commit callbacks with a mutex, since the reactions of one request run concurrently.
- **A port is the seam, proved twice**: the SQLite pair of Notes (`SqliteNoteRepository` in [`repositories.go`](contexts/notes/infrastructure/repositories.go), `SqliteNoteQueries` in [`queries.go`](contexts/notes/infrastructure/queries.go), over the one table of [`notes_table.go`](contexts/notes/infrastructure/notes_table.go)) implements the same two interfaces as the in-memory pair on `database/sql` and the pure-Go `modernc.org/sqlite`, with the optimistic check as one `UPDATE … WHERE version = ?`, and the [contract test](contexts/notes/infrastructure/persistence_contract_test.go) holds both to the same expectations; not one line of the Domain or the Application changed for it.
- **The transport is the standard library's `net/http`; a route is a handler func on the `ServeMux`** the context's `routes.go` registers under its prefix ([`notes/presentation/routes.go`](contexts/notes/presentation/routes.go)), with the 1.22 patterns (`"POST /v1/notes/{id}/share"`). A command route is `presentation.Accept(w, presentation.ContextOf(r), TheCommand{...})`; a query route runs `application.Query()` and answers through a view struct (camelCase JSON tags, what the API promises) or `presentation.Refuse()`. A request body is a struct beside the route, read by `presentation.DecodeBody()`, which refuses what does not parse. The per-request `ExecutionContext` is built by the transport ([`transport/server.go`](bootstrap/transport/server.go), which names no context) and read with `presentation.ContextOf(r)`; who is calling is asked of the `Authenticate` hook the composition root gives it — Security's, which never blocks — for every request, the websocket upgrade included, and without one every caller is anonymous. A context's routes are mounted with `server.Routes("/notes", notesapi.Routes, notesModule)`, under the API prefix. The websocket channel is a `coder/websocket` handler the Notifications wiring exposes and the composition root mounts at `/ws`. The end-to-end tests boot the real application on a free port ([`testing.go`](bootstrap/testing.go)) and speak HTTP with `net/http`; a `202` is followed through the Tracker to its outcome, as a client would.
- **Events are durable before they are published** ([ADR 24](../docs/adr/0024-events-are-durable-before-they-are-published.md)): `application.PublishDomainEvents()` registers a `BeforeCommit()` step that appends the aggregate's events to the unit of work's outbox ([`outbox.go`](architecture/application/outbox.go), the port and `RelayOutbox()`), inside the transaction; `application.Transaction()` relays the outbox through the bus after the outermost commit, each entry's id as the operation's (`PublishWithID()`), and the in-memory bus keeps an inbox per subscription so a relayed message reaches a subscriber once ([`infrastructure/event_bus.go`](architecture/infrastructure/event_bus.go)). The in-memory outbox ([`infrastructure/outbox.go`](architecture/infrastructure/outbox.go)) is a store the unit of work snapshots with the others, one per process (`SharedOutbox`), relayed once at start by the composition root.
- **A conflict is retried from a fresh read, then refused** ([ADR 25](../docs/adr/0025-a-conflict-is-retried-from-a-fresh-read-then-refused.md)): `application.Run()` runs `Execute()` again in a new transaction when the refusal is a `ConcurrencyConflict`, up to `ConflictAttempts` (three) times, and the third conflict is the operation's; a handler is safe to run twice up to its save, which every handler of the reference is ([`command_handler.go`](architecture/application/command_handler.go)).

## The map: concept → file

One canonical example per concept, rendered from [`conventions/concepts.yaml`](../conventions/concepts.yaml) — the concepts, shared with every language — and [`conventions/go.yaml`](../conventions/go.yaml), this language's binding, which names the file that shows each; CI checks that every file they name exists.

### Domain layer

<!-- generated from conventions/concepts.yaml (domain); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Entity | [`entity.go`](architecture/domain/entity.go) | identity, `equals()`; a struct with its state in unexported fields; two entities compare through `Equals()` or their snapshots |
| Aggregate root | [`note.go`](contexts/notes/domain/note/note.go) embedding [`AggregateRoot`](architecture/domain/aggregate_root.go) | behaviours enforce invariants and `record()` events; `Record()` is exported because an aggregate lives in its own package; a behaviour calls it, a handler never does |
| **Entity inside an aggregate** (not a root) | [`delivery_attempt.go`](contexts/notifications/domain/notification/delivery_attempt.go) | has its own identity, exists only inside `Notification`, reached and persisted through it. The criterion: few, consistent with the root in the same change, written through the root. What grows without bound or is written by others is its own aggregate (comments on a note); created and reached through `Notification` only, persisted in its snapshot |
| Value object | [`note_title.go`](contexts/notes/domain/note/note_title.go), [`email.go`](sharedkernel/domain/email.go), [`delivery_strategy.go`](contexts/notifications/domain/notification/delivery_strategy.go) | built through `create()` → `Result`; never invalid once you hold one; a struct with one unexported field and a constructor returning `(T, error)`; [`value_object.go`](architecture/domain/value_object.go) names the shape, and the struct's `==` gives the equality |
| Identity | [`id.go`](architecture/domain/id.go) | generated by the domain (`Id.generate()`), not by the database — [ADR 2](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| Factory | `note.Create()` in [`note.go`](contexts/notes/domain/note/note.go); when creation needs a port, [`account_registration.go`](contexts/security/domain/account/account_registration.go) | the aggregate is its own factory: a static `create()` that validates, generates the identity and records the creation event; the constructor is private. When creation needs a collaborator (a port), the factory is a domain service. No `Factory` class |
| Invariant | `ShareWith()` in [`note.go`](contexts/notes/domain/note/note.go) | a rule that must hold after every change (only the owner, not archived, not twice, not with yourself): checked inside the behaviour, before the state changes and the event is recorded. There is no `validate()` to forget, and no way to reach the state but through the behaviour |
| Creation vs reconstitution | `note.Create()` vs `note.FromSnapshot()` in [`note.go`](contexts/notes/domain/note/note.go) | creation records an event; rebuilding from persistence records nothing — [ADR 4](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md); corrupted storage panics, which is what a throw is here |
| Domain event | [`events.go`](contexts/notes/domain/note/events.go) | past tense, minimal payload, internal to the context; a struct per fact embedding `domain.DomainEvent`, named by its type; [`event.go`](architecture/domain/event.go) has the three kinds |
| Domain exception | [`exceptions.go`](contexts/notes/domain/note/exceptions.go) | a broken rule in business words, carried by `Result.fail()`, never thrown — [ADR 1](../docs/adr/0001-result-instead-of-exceptions.md); a constructor per rule returning a [`*domain.Exception`](architecture/domain/exception.go) — an error value returned, never panicked |
| `Result` | [`result.go`](architecture/domain/result.go) | `IResult<T>` is the type you write in signatures; the `(T, error)` pair, the error a `*domain.Exception` read with `domain.Refusal(err)`, which is what TypeScript wrote as `if (r.isFailure()) return r` |
| **Optimistic concurrency** | `AggregateRoot.Version()` in [`aggregate_root.go`](architecture/domain/aggregate_root.go), checked by `Save()` in [`repositories.go`](contexts/notes/infrastructure/repositories.go) | the aggregate carries the version it was read at and never changes it; the repository stores version + 1 and refuses a stale one with `ConcurrencyConflict`, so of two writers who read the same version only the first wins — [ADR 8](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md); the contract test asserts it for every adapter |
| Repository port | [`repository.go`](contexts/notes/domain/note/repository.go) | load / save an aggregate; nothing else; an interface in the aggregate package, so an adapter may be in-memory or a database |
| Queries port & read models | [`queries.go`](contexts/notes/domain/note/queries.go) | returns view shapes, never aggregates — [ADR 5](../docs/adr/0005-queries-return-read-models-not-aggregates.md) |
| Snapshot DTO | [`dtos.go`](contexts/notes/domain/note/dtos.go) | the plain shape that crosses to the infrastructure |
| **Domain service** | [`account_registration.go`](contexts/security/domain/account/account_registration.go), [`note_sharing.go`](contexts/notes/domain/note/note_sharing.go) | a rule about the whole collection ("one account per email") — needs the port, still pure domain; takes its port in its constructor, so a test hands it a five-line type |
| **Port to another context** (read side) | [`account_directory.go`](contexts/notes/domain/note/account_directory.go), used by [`note_sharing.go`](contexts/notes/domain/note/note_sharing.go), answered over Security's read model by [`directories.go`](contexts/notes/infrastructure/directories.go) | Notes asks "does this account exist?" in its own words; only its infrastructure knows Security is next door. The read-side counterpart of the anti-corruption layer for events; the wiring takes the directory as a parameter; the composition root builds it, where the two contexts meet |
| Ports for technical concerns | [`password_hasher.go`](contexts/security/domain/auth/password_hasher.go), [`signed_tokens.go`](contexts/security/domain/auth/signed_tokens.go) | hashing has a business meaning; the algorithm does not belong here |
| Lifecycle as an enum | [`note_status.go`](contexts/notes/domain/note/note_status.go), [`account_status.go`](contexts/security/domain/account/account_status.go) | the transitions live in the aggregate, not in the enum |
<!-- end generated -->

### Application layer

<!-- generated from conventions/concepts.yaml (application); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Command | `ShareNoteCommandEvent` in [`share_note.go`](contexts/notes/application/commands/share_note.go) | a named payload, nothing more. It extends `CommandEvent`, one of the three kinds of message the building blocks define: a command travels on the same bus as the events and is tracked as an operation, so it has their shape; the class says its intent (one handler, may be refused); a struct embedding `domain.CommandEvent`, its fields the payload; its handler is in the same file, and the channel is the type name (`domain.NameOf()`) |
| Command handler | `EditNoteHandler` in [`edit_note.go`](contexts/notes/application/commands/edit_note.go) | the shape every "change an existing thing" use case follows; takes its ports in its constructor; `Execute()` returns `(R, error)` and returns a refusal as is |
| Guard (authorization) | `RequireSignedIn()` in [`guards.go`](sharedkernel/application/guards.go), called once at the top of `Execute()`; `Guard()` in [`register_admin.go`](contexts/security/application/commands/register_admin.go) | *who may call* is answered here; *what they may do to which object* is the aggregate's business |
| Application service | [`delivery.go`](contexts/notifications/application/delivery.go) | orchestrates ports for a use case several entry points share; holds no rule of its own; holds the channels by `Channel`, each behind the port, since a strategy walks a list of adapters of different kinds |
| Base handler (guard, transaction, safety net) | [`command_handler.go`](architecture/application/command_handler.go) | a concrete handler only writes `execute()`; `application.Run()` is the template, generic over the handler: guard, log, transaction, safety net; `application.Command()` wraps it for the bus; a concrete handler writes `Execute()` |
| Query handler | [`get_note.go`](contexts/notes/application/queries/get_note.go) | reads through the queries port; a refused query is a failed `Result`, not a throw; `application.Query()` runs a `QueryHandler[P, R]`: the parameters, the read model; the module finds it by its type with `application.QueryOf[*H]()` |
| Execution context | [`execution_context.go`](architecture/application/execution_context.go) | who is calling, with which logger, bus and unit of work; `withTransaction`, `afterCommit`; `application.Transaction()` takes a function returning `(T, error)`, `BeforeCommit()` and `AfterCommit()` a plain func; the outbox is relayed between the two |
| Publish after commit | `application.PublishDomainEvents()` in [`domain_events.go`](architecture/application/domain_events.go) | [ADR 3](../docs/adr/0003-publish-domain-events-after-commit.md); the handler hands the aggregate over, and the events are pulled at the commit, into the outbox |
| Transactional outbox | [`outbox.go`](architecture/application/outbox.go) (the port and `RelayOutbox()`), [`infrastructure/outbox.go`](architecture/infrastructure/outbox.go), [`domain_events.go`](architecture/application/domain_events.go) (appends at commit) | the facts a transaction makes durable with the state they describe, relayed to the bus after the commit; a crash after the commit loses nothing, the next relay publishes what is pending ([ADR 24](../docs/adr/0024-events-are-durable-before-they-are-published.md)); the in-memory outbox is a store the unit of work snapshots with the others; `SharedOutbox` is the process's, relayed once at start by the bootstrap |
| Retry on conflict | [`command_handler.go`](architecture/application/command_handler.go) (`ConflictAttempts`), [`command_handler_test.go`](architecture/application/command_handler_test.go) | a command refused by a concurrency conflict is re-read and re-decided by its handler in a new transaction, up to three times; the third conflict is the client's ([ADR 25](../docs/adr/0025-a-conflict-is-retried-from-a-fresh-read-then-refused.md)); `application.Run()` runs `Execute()` again in a new transaction when `domain.IsConcurrencyConflict(err)`, up to three times |
| Domain event handler | [`note_shared_handler.go`](contexts/notes/application/events/note_shared_handler.go) | where a fact leaves its context |
| Integration event (published contract) | [`note_integration_events.go`](sharedkernel/application/integrationevents/note_integration_events.go) | the only thing one context may know about another — [ADR 6](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md) |
| **Anti-corruption layer** | [`note_shared_handler.go`](contexts/notifications/application/events/note_shared_handler.go) | restates a foreign fact in local terms; one handler per consumed contract, in [`events/`](contexts/notifications/application/events/doc.go); each knows the contract and nothing else of the other context |
| **Projection / read model** | [`projection.go`](contexts/tracker/application/projection.go), [`read_model.go`](contexts/tracker/application/read_model.go) | a context with no aggregate at all |
| **Non-determinism as a value** (ADR 7) | [`suggestions.go`](contexts/notes/application/suggestions/suggestions.go) → [`suggest_note_title.go`](contexts/notes/application/commands/suggest_note_title.go), answered locally by [`infrastructure/suggestions.go`](contexts/notes/infrastructure/suggestions.go) | a decision the domain cannot make from its own state (a model, a heuristic, a person) enters it as a value the aggregate validates and may refuse; the provenance travels with it and ends on the operation — [ADR 7](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md) |
| Module (wiring) | [`module.go`](architecture/application/module.go), used in [`notes/module.go`](contexts/notes/module.go) | plain data: which handler answers which command, query, event; an `application.Command()` per command and an `application.Reaction()` per reaction, on the event's type; the directory another context answers comes in as a parameter |
<!-- end generated -->

### Infrastructure layer

<!-- generated from conventions/concepts.yaml (infrastructure); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Repository implementation | [`repositories.go`](contexts/notes/infrastructure/repositories.go) | snapshot in, snapshot out |
| Queries implementation | [`queries.go`](contexts/notes/infrastructure/queries.go) | builds read models from the same store, here |
| **Second adapter of the same port** | `SqliteNoteRepository` in [`repositories.go`](contexts/notes/infrastructure/repositories.go) and `SqliteNoteQueries` in [`queries.go`](contexts/notes/infrastructure/queries.go), over the one table of [`notes_table.go`](contexts/notes/infrastructure/notes_table.go) (database/sql on modernc.org/sqlite) | the proof that the port is the seam: a real database behind the same interfaces, not one line changed in Domain or Application. The local wiring keeps the in-memory pair; both are held to the same contract spec; the contract test: [`persistence_contract_test.go`](contexts/notes/infrastructure/persistence_contract_test.go); the optimistic check is one `UPDATE … WHERE version = ?` |
| Port implementations | [`signed_tokens.go`](contexts/security/infrastructure/signed_tokens.go) (golang-jwt), [`password_hasher.go`](contexts/security/infrastructure/password_hasher.go) (x/crypto/bcrypt), [`channels/websocket.go`](contexts/notifications/infrastructure/channels/websocket.go) (coder/websocket) |  |
| Event bus | [`event_bus.go`](architecture/infrastructure/event_bus.go) | the only bus implementation; `Publish()` starts the dispatch in a goroutine and answers at once; `Settle()` waits for what is in flight; the port is [`event_bus.go`](architecture/application/event_bus.go) |
| Idempotent delivery (the inbox) | [`event_bus.go`](architecture/infrastructure/event_bus.go) (the inbox: `Subscribe()`), [`event_bus_test.go`](architecture/infrastructure/event_bus_test.go) | a fact relayed from the outbox may reach the bus twice; the bus recognises a message it already delivered to a subscriber by the message's id and delivers it once ([ADR 24](../docs/adr/0024-events-are-durable-before-they-are-published.md)); `PublishWithID()` carries the outbox entry's id as the operation's; each subscription keeps the ids it handled and marks a repeat sent |
| Decorator (cross-cutting concern) | [`tracked_event_bus.go`](contexts/tracker/infrastructure/tracked_event_bus.go) | tracking layered on any bus; neither the bus nor the handlers know; wraps `Publish` and `Dispatch`: a record before, a record after, the completion notice when it is a command's |
| Unit of work | [`unit_of_work.go`](architecture/infrastructure/unit_of_work.go) | over the stores the composition root lists, or every store of the process |
| The "database" | [`data_source.go`](architecture/infrastructure/data_source.go) | a `Map`; the ports are what a real adapter would implement; a map and the keys in insertion order, behind a mutex |
<!-- end generated -->

### Presentation and bootstrap

<!-- generated from conventions/concepts.yaml (presentation); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example |
| --- | --- |
| Controller (commands → `202 { operationId }`, queries → sync; one `refuse()` per controller: `403` not allowed, `404` not found, `400` otherwise, always `{ message }`) | [`notes/presentation/routes.go`](contexts/notes/presentation/routes.go); every other context's has the same shape |
| Routes and JSON schemas | the mux patterns, the request bodies and the views of [`notes/presentation/routes.go`](contexts/notes/presentation/routes.go), on [`architecture/presentation/http.go`](architecture/presentation/http.go) (`Accept()`, the refusals, `DecodeBody()`) |
| Authentication middleware | [`authentication.go`](contexts/security/presentation/authentication.go) — never blocks, leaves the caller anonymous unless the token verifies; an `http.Handler` middleware over every request, the websocket upgrade included |
| Presenters (one use case, several formats) | [`security/presentation/presenters.go`](contexts/security/presentation/presenters.go), picked per request by [`format.go`](architecture/presentation/format.go) — a `ByFormat` value per answer beside the controller, no registry |
| Composition root | [`create_application.go`](bootstrap/create_application.go) on [`application.go`](architecture/application/application.go) and [`transport/server.go`](bootstrap/transport/server.go), the transport, which knows no context: wires, starts the modules, seeds the administrator through the same handler as any command, then listens; [`cmd/application/main.go`](bootstrap/cmd/application/main.go) is the process entry point, and [`starter/create_application.go`](bootstrap/starter/create_application.go) the composition a created application starts from (the Tracker alone; ADR 27) |
<!-- end generated -->

### Tests, one style per layer

<!-- generated from conventions/concepts.yaml (tests); edit the YAML, then run the conventions check with --write -->
| Layer | Example | Doubles |
| --- | --- | --- |
| Domain | [`note_test.go`](contexts/notes/domain/note/note_test.go) | none |
| Domain service | [`note_sharing_test.go`](contexts/notes/domain/note/note_sharing_test.go) | a five-line type implementing the port |
| Application | [`commands_test.go`](contexts/notes/application/commands/commands_test.go), [`delivery_test.go`](contexts/notifications/application/delivery_test.go) | the in-memory repository *is* the double; a recording bus of ten lines says what was published; a fake channel remembers what it received |
| Infrastructure | [`tracked_event_bus_test.go`](contexts/tracker/infrastructure/tracked_event_bus_test.go), [`signed_tokens_test.go`](contexts/security/infrastructure/signed_tokens_test.go) | real in-memory pieces |
| **Contract** (one port, every adapter) | [`persistence_contract_test.go`](contexts/notes/infrastructure/persistence_contract_test.go) | none — every case runs over each entry of the adapters table, the in-memory and the SQLite pair, same expectations |
| End to end | [`notes_routes_e2e_test.go`](bootstrap/notes_routes_e2e_test.go) | the whole application, booted in-process on a free port by [`testing.go`](bootstrap/testing.go), spoken to over HTTP with `net/http`; a `202` is followed through the Tracker to its outcome |
<!-- end generated -->

## The rules, and how they are enforced

The rules are the contract's, listed with their ids in the root [CLAUDE.md](../CLAUDE.md); what stands behind each enforcement word here is in the binding's `enforcers`: `linter` and `check` are both `go run ./tools/conventions`, `types` is `go vet` and the compiler, `tests` is `go test`.

<!-- generated from conventions/architecture.yaml (rules); edit the YAML, then run the conventions check with --write -->
| Rule | Enforced by |
| --- | --- |
| **ARCH-RELATIVE** — A relative import names a sibling file and nothing else; anything across directories goes through the path the import rules are written against. | `go run ./tools/conventions`, a go/parser walk holding every import of every file to its row of the table · [linter.go](tools/conventions/linter.go) |
| **ARCH-INWARD** — Dependencies point inward and contexts stay apart — each file imports only what its row of the dependency table allows; there is no exception and none may be added. | `go run ./tools/conventions`, a go/parser walk holding every import of every file to its row of the table · [architecture.yaml](../conventions/architecture.yaml), [README.md](../conventions/README.md), [linter.go](tools/conventions/linter.go), [doc.go](contexts/notes/domain/note/doc.go) |
| **ARCH-TREES** — The building blocks import nothing outside themselves, not even the shared kernel; the shared kernel imports the building blocks and no context. | `go run ./tools/conventions`, a go/parser walk holding every import of every file to its row of the table · [architecture](architecture), [sharedkernel](sharedkernel) |
| **ARCH-CONTEXT-DECLARED** — Every directory under the contexts tree is a context declared in the language's binding, holds only the declared layers and its wiring file. | `go run ./tools/conventions` · [README.md](../conventions/README.md) |
| **ARCH-MODULES-DATA** — A context's wiring is one file building a Module as data — its name, its commands, its queries, its domain event and integration event handlers; anything else it exposes is a named export of that file. No container, no builder, no service locator. | review (stated here, not yet mechanical) · [module.go](contexts/notes/module.go), [module.go](architecture/application/module.go) |
| **ARCH-ONE-HANDLER** — A command has exactly one handler — the Module lists it once, with one handler, and every command a route or a policy builds is one the Module lists; a fact may have any number of subscribers. | `go run ./tools/conventions` · [0026-a-command-has-exactly-one-handler.md](../docs/adr/0026-a-command-has-exactly-one-handler.md), [module.go](contexts/notes/module.go) |
| **ARCH-EXECUTION-CONTEXT** — ExecutionContext carries what exists per request and nothing else — who is calling, the trace, the transaction, the bus, the logger. A mailer, a clock, a model client is a constructor dependency of the handler that needs it. | review (stated here, not yet mechanical) · [execution_context.go](architecture/application/execution_context.go) |
| **DOMAIN-RESULT** — A refused command or query is a failed Result value, never a thrown exception; throwing (or panicking) is for programming errors and corrupted state only. | `go test ./...` · [0001-result-instead-of-exceptions.md](../docs/adr/0001-result-instead-of-exceptions.md), [result.go](architecture/domain/result.go) |
| **DOMAIN-RECORDS-EVENTS** — Only an aggregate root records domain events (`record(...)` inside a behaviour); handlers never construct one, they call `publishDomainEvents(aggregate, context)` after saving. | `go vet ./...` and the compiler · [aggregate_root.go](architecture/domain/aggregate_root.go), [domain_events.go](architecture/application/domain_events.go) |
| **DOMAIN-CREATE-VS-RECONSTITUTE** — `create()` / `register()` validates and records a creation event; `fromSnapshot()` records nothing and throws on corrupted data. | `go test ./...` · [0004-reconstitution-throws-on-corrupted-data.md](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md), [note.go](contexts/notes/domain/note/note.go) |
| **DOMAIN-IDENTITY** — An aggregate generates its own identity (`Id.generate()` in `create()`). A repository loads and saves aggregates, and answers the facts a domain rule needs about the collection (`findByEmail`, `countByOwner`); it never hands out identities and never searches for a screen. | review (stated here, not yet mechanical) · [0002-identity-is-generated-by-the-domain.md](../docs/adr/0002-identity-is-generated-by-the-domain.md), [note.go](contexts/notes/domain/note/note.go), [repository.go](contexts/notes/domain/note/repository.go) |
| **DOMAIN-NON-DETERMINISM** — Time is a parameter with a default; identity is generated by the domain; anything else that is not a function of the business state (randomness, a model, a person, another system) lives behind a port named for what it decides, and its result is a plain value the aggregate validates and may refuse. | review (stated here, not yet mechanical) · [0007-non-determinism-enters-the-domain-as-a-value.md](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md), [suggestions.go](contexts/notes/application/suggestions/suggestions.go), [suggest_note_title.go](contexts/notes/application/commands/suggest_note_title.go) |
| **EVENT-AFTER-COMMIT** — Domain events are made durable with the state they describe, in the same transaction (the outbox), and published from there after the commit — never before, and never from memory alone; a rolled-back transaction stores nothing and leaves the events on the aggregate; a fact a crash kept from being published is published on the next relay, so a subscriber may see a fact twice and the bus delivers a message it already delivered once only. | `go test ./...` · [0003-publish-domain-events-after-commit.md](../docs/adr/0003-publish-domain-events-after-commit.md), [0024-events-are-durable-before-they-are-published.md](../docs/adr/0024-events-are-durable-before-they-are-published.md), [execution_context.go](architecture/application/execution_context.go), [domain_events.go](architecture/application/domain_events.go), [domain_events_test.go](architecture/application/domain_events_test.go), [event_bus_test.go](architecture/infrastructure/event_bus_test.go) |
| **QUERY-READ-MODELS** — Queries return read models, repositories return aggregates; never the other way. | `go vet ./...` and the compiler · [0005-queries-return-read-models-not-aggregates.md](../docs/adr/0005-queries-return-read-models-not-aggregates.md), [queries.go](contexts/notes/domain/note/queries.go), [queries.go](contexts/notes/infrastructure/queries.go) |
| **CTX-CONTRACTS** — Contexts talk in two ways only — integration events published in the shared kernel, and ports the asking side owns, answered by an adapter over the other context's read model; a context's Domain never imports another context. | `go run ./tools/conventions`, a go/parser walk holding every import of every file to its row of the table · [0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md), [directories.go](contexts/notes/infrastructure/directories.go), [note_shared_handler.go](contexts/notes/application/events/note_shared_handler.go), [note_shared_handler.go](contexts/notifications/application/events/note_shared_handler.go) |
| **CONC-OPTIMISTIC** — An aggregate carries the version it was read at and never changes it; `save()` stores version + 1 and refuses an aggregate that is no longer at the stored version with a ConcurrencyConflictException; the command handler then re-reads and re-decides in a new transaction, up to three attempts, and the third conflict is the operation's refusal. | `go test ./...` · [0008-optimistic-concurrency-on-the-aggregate.md](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md), [0025-a-conflict-is-retried-from-a-fresh-read-then-refused.md](../docs/adr/0025-a-conflict-is-retried-from-a-fresh-read-then-refused.md), [repositories.go](contexts/notes/infrastructure/repositories.go), [persistence_contract_test.go](contexts/notes/infrastructure/persistence_contract_test.go), [command_handler_test.go](architecture/application/command_handler_test.go) |
| **ARCH-MAP-IS-REAL** — Every file the concept map names exists, every documentation link resolves, nothing silences the linter, and the generated import rules refuse and allow what the probes say. | `go run ./tools/conventions` · [concepts.yaml](../conventions/concepts.yaml), [main.go](tools/conventions/main.go) |
| **ARCH-LEARNABLE** — A newcomer, or an agent, can add a feature in the right shape from the documentation alone. | fresh-agent evaluations · [README.md](../docs/evaluations/README.md) |
| **ARCH-ONE-CONTRACT** — Every language the reference is written in is held to this file — the same layers, the same rules under the same ids, the same HTTP grammar — through a binding that says where its trees are and which file shows each concept; a language never carries a rule of its own. | `go run ./tools/conventions` · [0011-one-reference-several-languages.md](../docs/adr/0011-one-reference-several-languages.md), [README.md](../conventions/README.md) |
| **API-ONE-SURFACE** — Every language answers the same HTTP API — the same routes, status codes, body shapes and public names — so one black-box scenario, run against each server, passes unchanged; the public name of an operation is its intent or its fact without the suffix of its kind (`ShareNote`, `NoteShared`). | `go test ./...` · [0016-one-api-for-every-language.md](../docs/adr/0016-one-api-for-every-language.md), [projection.go](contexts/tracker/application/projection.go), [operation_routes_e2e_test.go](bootstrap/operation_routes_e2e_test.go) |
| **CTX-MAP-DECLARED** — Every relationship between two contexts is declared once in the context map, with the strategic pattern it follows, the mechanism that carries it and why; the contracts it carries are read from the code, and the check refuses a link in the code the map does not declare and a declared relationship nothing in the code carries, unless it is declared `planned` — decided before the code that carries it. | `go run ./tools/conventions` · [0019-the-domain-is-data.md](../docs/adr/0019-the-domain-is-data.md), [0028-a-relationship-is-decided-before-its-code.md](../docs/adr/0028-a-relationship-is-decided-before-its-code.md), [README.md](../conventions/README.md) |
| **ARCH-ONE-APPLICATION** — Every language's tree says the same application, in words every language shares — the commands of each context with who may call them, their route, the aggregate they reach and the events it records; the queries; the domain events; the policies and what they publish or reach; the links between contexts; each language's tool writes that inventory from its own tree, and the check holds the inventories equal. | `go run ./tools/conventions` · [0021-one-application-every-language-writes-the-same-inventory.md](../docs/adr/0021-one-application-every-language-writes-the-same-inventory.md), [README.md](../conventions/README.md), [inventory.go](tools/conventions/inventory.go) |
<!-- end generated -->

### Who may import whom

<!-- generated from conventions/architecture.yaml (dependencies); edit the YAML, then run the conventions check with --write -->
| A file in… | may import | Rule |
| --- | --- | --- |
| Domain | `own.Domain`, `architecture.Domain`, `kernel.Domain` | ARCH-DOMAIN |
| Application | `own.Domain`, `own.Application`, `architecture.Domain`, `architecture.Application`, `kernel.Domain`, `kernel.Application` | ARCH-APPLICATION |
| Application specs | `own.Infrastructure`, `architecture.Infrastructure` | ARCH-APPLICATION-SPECS |
| Infrastructure | `own.Domain`, `own.Application`, `own.Infrastructure`, `architecture.Domain`, `architecture.Application`, `architecture.Infrastructure`, `kernel.Domain`, `kernel.Application`, `others.Domain`, `libraries` | ARCH-INFRASTRUCTURE |
| Presentation | `own.Domain`, `own.Application`, `own.Presentation`, `architecture.Domain`, `architecture.Application`, `architecture.Presentation`, `kernel.Domain`, `kernel.Application`, `libraries` | ARCH-PRESENTATION |
| wiring_file | `own.*`, `architecture.*`, `kernel.*`, `others.wiring`, `bootstrap`, `libraries` | ARCH-WIRING |
| e2e_specs | `bootstrap`, `libraries` | ARCH-E2E |
<!-- end generated -->

## Layout

```
go.mod                            the module (clean-ddd): its dependencies; .golangci.yml the lints
architecture/
  domain/                         the building blocks' Domain: Entity, AggregateRoot, ID, the three kinds of Event,
                                  Exception, the (T, error) result — depends on nothing
  application/                    Run, Query, Command, Reaction (the templates), EventHandler, ExecutionContext,
                                  Operation, the EventBus port, Module, PublishDomainEvents()
  infrastructure/                 InMemoryDataSource, InMemoryEventBus, InMemoryUnitOfWork, ConsoleLogger
  presentation/                   Accept(), Refuse(), StatusOf(), ContextOf(), DecodeBody(); Format, Presenter, ByFormat
sharedkernel/
  domain/                         Email, Role
  application/                    guards.go (RequireSignedIn), integrationevents/ (the published contracts)
contexts/notes/
  domain/note/                    package note
    note.go                       the aggregate                 note_title.go           value object
    note_status.go                lifecycle                     events.go               domain events
    exceptions.go                 broken rules, in business words
    dtos.go                       the snapshot shape            note_sharing.go         domain service
    repository.go queries.go      the ports (write; read models); account_directory.go the port to another context
  application/
    commands/<use_case>.go        the command and its handler, one file each; commands_test.go beside them
    queries/<use_case>.go         one query handler each
    events/<fact>_handler.go      the reactions: NoteCreated (a log line), NoteShared (an integration event)
    suggestions/                  the port for a title suggestion (ADR 7)
  infrastructure/
    repositories.go queries.go    the in-memory pair over one store, and the SQLite pair over notes_table.go
    suggestions.go                the first-line heuristic      directories.go   Notes' directory, over Security's read model
    persistence_contract_test.go  one port, every adapter
  presentation/
    routes.go                     the REST routes and their views; presenters.go the HTMX form
  module.go                       the wiring: the store, the adapters, the handlers listed in a Module
contexts/security/                the same shape: domain/account (Account, Credentials, AccountRegistration, the ports),
                                  domain/auth (the token and hashing ports), application/, infrastructure/
                                  (bcrypt, golang-jwt), presentation/ (routes, presenters, authentication.go), module.go
contexts/tracker/                 no domain: application/ (the read model, the projection, the queries),
                                  infrastructure/ (the records, tracked_event_bus.go), presentation/, module.go
contexts/notifications/           domain/notification (Notification, DeliveryAttempt, DeliveryStrategy, the channel port),
                                  application/ (delivery.go, the commands, the inbox query, events/ the anti-corruption
                                  handlers), infrastructure/channels/ (email, websocket), presentation/, module.go
bootstrap/
  create_application.go           the composition root: the bus, the stores, the modules, their routes, the authentication, the seed
  settings.go home.go             what the environment decides; the home in two formats
  transport/server.go             the transport, which names no context: the request's identity and ExecutionContext, CORS,
                                  the routes under the API prefix, listening
  starter/                        the composition root a created application starts from: the Tracker alone, and its
                                  end-to-end suite (package bootstrap, which `create` copies in place of the one above)
  cmd/application/main.go         the entry point, the same for both: go run ./bootstrap/cmd/application
  testing.go                      boots the application on a free port for the end-to-end suites beside it
  *_e2e_test.go                   the end-to-end suites, speaking HTTP
  *_test.go                       everywhere: the tests, beside what they test
tools/conventions/                go run ./tools/conventions: every import is the table, the tree is the contract's
```

## Running it

Requires Go ≥ 1.24 and [golangci-lint](https://golangci-lint.run/) v2. Everything runs from this directory; the first `go` command downloads the modules.

```bash
cd go
go run ./tools/conventions                  # every import is the table, the tree matches the binding, every named file exists, the inventory is current
go run ./tools/conventions inventory        # what this tree says the application is, in words every language shares (docs/inventory/go.json)
go run ./tools/conventions inventory --write   # write it there, after a feature; the check refuses a stale one and the TypeScript check holds the languages equal
test -z "$(gofmt -l .)"                     # the formatter, as CI runs it (gofmt -w . to apply)
go vet ./...                                # the compiler's second look
golangci-lint run ./...                     # the lints
go test ./...                               # every _test.go, the end-to-end suites included
go run ./bootstrap/cmd/application          # serves http://127.0.0.1:10000/v1 (PORT, API_PREFIX, WEB_ORIGINS, ADMIN_IDENTIFIER, ADMIN_PASSWORD, JWT_SECRET)
node ../api/scenario.mjs http://127.0.0.1:10000   # the API every language answers, walked against that server
```

Once it serves: `GET /v1` is the home; `POST /v1/auth/login` with `{ "identifier": "admin@admin.fr", "password": "admin" }` answers the token the other routes take as `Authorization: Bearer`, and a `202` is followed at `GET /v1/tracker/operations/{operationId}`. The HTMX front end ([`web/htmx`](../web/htmx)) is a client of this API like any other, served by any static server from any origin ([ADR 17](../docs/adr/0017-the-front-end-is-a-client-served-elsewhere.md)). `clean-ddd create --language go` ([ADR 10](../docs/adr/0010-a-new-application-is-copied-not-templated.md), [ADR 27](../docs/adr/0027-a-created-application-starts-with-the-tracker.md)) gives a new Go module the building blocks, the shared kernel's model, the conventions tool and none of the business, plus what every asynchronous application needs: the Tracker, which a client follows a command's `202` at, with its contract, the transport, the entry point, and [`starter/create_application.go`](bootstrap/starter/create_application.go) as its `bootstrap/create_application.go`, with its end-to-end suite; it serves `GET /v1/tracker/operations/{id}` on its first run. The documents of this directory are rendered from the contract by the TypeScript tooling, which reads every binding: after editing `conventions/go.yaml`, run `yarn --cwd ../typescript conventions:write`.

## Vocabulary

The words the reference uses, with the file that shows them here.

<!-- generated from conventions/concepts.yaml (vocabulary); edit the YAML, then run the conventions check with --write -->
| Word | Here it means | See |
| --- | --- | --- |
| Building blocks | the mechanics every context is written with (Entity, AggregateRoot, ValueObject, Result, the handlers, the bus); they know no context and no vocabulary, not even the roles | [`architecture`](architecture) |
| Shared kernel | the part of the domain model every context agrees on — Email, Role, who counts as signed in, and the integration events; not the base classes, which is what the word is often misused for | [`sharedkernel`](sharedkernel) |
| Bounded context | a folder with its own vocabulary and wiring, talking to others through integration events and ports it owns only; its purpose, its language and its relationships are in the domain map | [`contexts`](contexts) |
| Aggregate (root) | the object that owns a consistency boundary: every change goes through one of its behaviours, which checks the invariants and records an event | [`note.go`](contexts/notes/domain/note/note.go) |
| Entity | an object with an identity that outlives its attributes | [`entity.go`](architecture/domain/entity.go) |
| Value object | an object without identity, compared by value, valid from the moment it exists | [`note_title.go`](contexts/notes/domain/note/note_title.go) |
| Invariant | a rule that must hold after every change of an aggregate | `ShareWith()` in [`note.go`](contexts/notes/domain/note/note.go) |
| Domain event | a fact, in the past tense, recorded by an aggregate for the rest of the system | [`events.go`](contexts/notes/domain/note/events.go) |
| Integration event | a fact restated as a published contract for other contexts | [`note_integration_events.go`](sharedkernel/application/integrationevents/note_integration_events.go) |
| Command | a request that something happen; one handler; may be refused | `ShareNoteCommandEvent` in [`share_note.go`](contexts/notes/application/commands/share_note.go) |
| Query | a question; answered from a read model; changes nothing | [`get_note.go`](contexts/notes/application/queries/get_note.go) |
| Read model | a shape built for reading, not an aggregate | [`queries.go`](contexts/notes/domain/note/queries.go) |
| Projection | a read model fed by events | [`projection.go`](contexts/tracker/application/projection.go) |
| Port | an interface the domain or the application declares in its own words, for something outside | [`repository.go`](contexts/notes/domain/note/repository.go), [`account_directory.go`](contexts/notes/domain/note/account_directory.go) |
| Adapter | the implementation of a port, in the infrastructure | [`repositories.go`](contexts/notes/infrastructure/repositories.go), [`suggestions.go`](contexts/notes/infrastructure/suggestions.go), [`directories.go`](contexts/notes/infrastructure/directories.go) |
| Repository | the port that loads and saves one aggregate by identity | [`repository.go`](contexts/notes/domain/note/repository.go) |
| Domain service | a business rule that spans several aggregates or needs a port | [`note_sharing.go`](contexts/notes/domain/note/note_sharing.go) |
| Application service | orchestration shared by several entry points; no rule of its own | [`delivery.go`](contexts/notifications/application/delivery.go) |
| Anti-corruption layer | the handler that translates a foreign contract into local terms | [`note_shared_handler.go`](contexts/notifications/application/events/note_shared_handler.go) |
| Snapshot | the plain shape of an aggregate that crosses to the infrastructure | [`dtos.go`](contexts/notes/domain/note/dtos.go) |
| Operation | the handle a client gets for a command: its status and outcome. The Tracker records one for every message on the bus, events included, so a trace shows what a command set off | [`operation.go`](architecture/application/operation.go) |
| Composition root | the one file that knows every context and builds the application | [`create_application.go`](bootstrap/create_application.go) |
<!-- end generated -->

## Known gaps

- **The email channel logs.** This reference has no mail server: the adapter writes what it would send to the console, and a real one would hand the same `Delivery` to a provider.
- **The SQLite adapters are not wired.** The local wiring keeps the in-memory pair, as in the other languages; the unit of work snapshots the in-memory stores only, so a SQLite deployment would bring its own unit of work over the connection's transactions, behind the same port.
- **No SQLite outbox yet.** The SQLite adapters write outside the in-memory unit of work, so the outbox port ([`outbox.go`](architecture/application/outbox.go)) has one adapter, the in-memory one; the day a SQLite unit of work spans the notes table and an outbox table, the port gets its second adapter and the contract test that holds both ([ADR 24](../docs/adr/0024-events-are-durable-before-they-are-published.md)).
- **The in-memory unit of work is a boundary, not isolation** (the same honest limit as the other languages): a rollback puts every store back, another request's writes included.
- **The boundary is held by a tool, not by the language.** Go has no compiler check against a package importing another of the same module; `tools/conventions` is the linter and the check, and a test file (`_test.go`) gets its layer's `specs` row the way the ESLint overrides give it to a `.spec.ts`. A refusal names its rule; what it cannot see is a package reached through a build tag or generated code, which this reference never does.
- **`Record()` is exported.** An aggregate lives in its own package, so the method a behaviour records with cannot be unexported from the building block; that a handler never calls it is DOMAIN-RECORDS-EVENTS, held by review here as in every language.
