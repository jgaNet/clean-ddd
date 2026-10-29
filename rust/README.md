# Clean Architecture & DDD, the Rust implementation

The Rust rendering of the [reference](../README.md): the same application, the same architecture ([`conventions/`](../conventions/README.md)), the same decisions ([`docs/adr`](../docs/adr)), under the same rules and the same ids. This page is about this directory, and every command on it runs from here.

**What is here today**: the whole application, every concept of the [map](../README.md#the-map-concept--language) included. The building blocks in their four layers, the shared kernel, the four contexts — Notes from its Domain to its routes, with an in-memory and a SQLite adapter behind the same ports; Security (accounts, sign-up, login, validation, the authentication layer, its answers in JSON or HTMX); Notifications (an inbox fed by the other contexts' facts, delivered over a websocket or by email); Tracker (every operation the bus carries, recorded and followed) — and the composition root in `src/bootstrap`, which builds the bus, the stores, the modules, the HTTP transport (axum) and the static HTMX front end, and whose end-to-end tests boot the whole application on a free port and speak HTTP to it.

- [Where the decisions land in Rust](#where-the-decisions-land-in-rust)
- [The map: concept → file](#the-map-concept--file)
- [The rules, and how they are enforced](#the-rules-and-how-they-are-enforced)
- [Layout](#layout)
- [Running it](#running-it)
- [Vocabulary](#vocabulary) · [Known gaps](#known-gaps)

## Where the decisions land in Rust

The decisions are the architecture's, so they hold here; the idiom changes how some of them read, and [ADR 12](../docs/adr/0012-in-rust-a-layer-is-a-crate.md) records the choices below.

- **A refusal is a value, never thrown** ([ADR 1](../docs/adr/0001-result-instead-of-exceptions.md)) is the language's own `Result`: [`DomainResult<T>`](src/architecture/domain/src/result.rs) is `Result<T, Exception>`, and `?` is what TypeScript wrote as `if (r.isFailure()) return r;`. A `panic!` is a throw: for a programming error and corrupted state only.
- **Reconstitution throws on corrupted data** ([ADR 4](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md)): `Note::from_snapshot` panics, with the note's id in the message.
- **Layers are crates, and the dependency table is held by the compiler.** Every layer of every tree is a crate whose `[dependencies]` are its row of the table ([`notes-domain`](src/contexts/notes/domain/Cargo.toml) depends on `architecture-domain` and `shared-kernel-domain`, and on nothing else). An import the table forbids does not lint; it does not compile. `cargo run -p conventions` proves the graph is the table.
- **No inheritance.** An aggregate *holds* an [`AggregateRoot`](src/architecture/domain/src/aggregate_root.rs) in a private field and delegates to it, which is also what keeps `record()` the aggregate's own; a value object *is* a newtype with a private field that derives `PartialEq`, and the compiler refuses to compare two kinds; an entity implements a trait, and `equals` takes a `&Self`, so an Order and an Invoice cannot be compared at all.
- **Events are enums**: one per aggregate, one variant per fact, the payload as named fields, so a test asserting an event asserts what it says. The three kinds of message are three traits in [`event.rs`](src/architecture/domain/src/event.rs).
- **Exceptions are values with a `kind`**: a constant per rule and a function that builds the [`Exception`](src/architecture/domain/src/exception.rs) with its details ([`note_exceptions.rs`](src/contexts/notes/domain/src/note/note_exceptions.rs)); a test asks `error.is(NOT_NOTE_OWNER)`.
- **Ports are traits whose methods return `impl Future`** ([`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs)), so an adapter may be an in-memory store or a database behind the same interface; a domain service and a handler are generic over the ports they need, and a test hands them a five-line struct — or the in-memory adapter, which *is* the double.
- **The bus routes type-erased events by name, and a handler is a trait with a provided `handle()`** ([ADR 13](../docs/adr/0013-in-rust-the-bus-routes-by-name-and-a-handler-is-a-trait.md)). `publish` takes an `Arc<dyn AnyEvent>`; a `CommandSubscriber` or `EventSubscriber` gives the typed handler its event back. The provided `handle()` of [`command_handler.rs`](src/architecture/application/src/command_handler.rs) is the template method — guard, log, transaction, safety net — and a concrete handler writes `execute()` as an `async fn`. The execution context is shared by `Arc`, `after_commit` takes a future, and `publish_domain_events` takes the aggregate by value and pulls its events at the commit.
- **A panic is caught, not propagated**: the safety net is `catch_unwind` around `execute()`, so a panic in a use case becomes a failed operation with the panic's message, and the transaction rolls back (DOMAIN-RESULT, second half).
- **The transport answers before the handling, and finds handlers by their message** ([ADR 14](../docs/adr/0014-in-rust-the-transport-spawns-the-dispatch-and-finds-handlers-by-their-message.md)). `publish()` builds the operation and hands it to `dispatch()`; a route does the same by hand through [`accept()`](src/architecture/presentation/src/lib.rs) — the operation's id goes out as `202`, the dispatch runs on the runtime after the answer. A command says what it answers with (`type Output` on the command), a query is a struct too, and a controller asks the module for a handler by the message's type (`module.query::<GetNote>()`, `module.command::<Login>().run(…)`), never by the handler's, which would name the adapter behind it. The runtime (`tokio`) is a library of the binding: it appears in the Presentation and the bootstrap, nowhere below.
- **The Tracker is a decorator of the bus** ([`tracked_event_bus.rs`](src/contexts/tracker/infrastructure/src/tracked_event_bus.rs)): a record before the dispatch, a record after, and the completion notice when the operation is a command's — which the bus knows because every message says its `EventKind`.
- **A port is the seam, proved twice**: the SQLite pair of Notes ([`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs), [`queries.rs`](src/contexts/notes/infrastructure/src/queries.rs), over the one table of [`notes_table.rs`](src/contexts/notes/infrastructure/src/notes_table.rs)) implements the same two traits as the in-memory pair, with the optimistic check as one `UPDATE … WHERE version = ?`, and the [contract test](src/contexts/notes/infrastructure/src/persistence_contract.rs) holds both to the same expectations; not one line of the Domain or the Application changed for it.
- **One use case, several formats**: a controller keeps a `const ByFormat` per answer — a JSON [`Presenter`](src/architecture/presentation/src/format.rs) and an HTMX one — and picks per request from the `HX-Request` header ([`security/presentation/presenters.rs`](src/contexts/security/presentation/src/presenters.rs)). The HTMX front end ([`web/htmx`](../web/htmx)) is a client of this API like any other, served by any static server from any origin ([ADR 17](../docs/adr/0017-the-front-end-is-a-client-served-elsewhere.md)).

## The map: concept → file

One canonical example per concept, rendered from [`conventions/concepts.yaml`](../conventions/concepts.yaml) — the concepts, shared with every language — and [`conventions/rust.yaml`](../conventions/rust.yaml), this language's binding, which names the file that shows each; CI checks that every file they name exists.

### Domain layer

<!-- generated from conventions/concepts.yaml (domain); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Entity | [`entity.rs`](src/architecture/domain/src/entity.rs) | identity, `equals()`; a trait; the kind is the type, so two kinds cannot even be compared |
| Aggregate root | [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) holding an [`AggregateRoot`](src/architecture/domain/src/aggregate_root.rs) | behaviours enforce invariants and `record()` events; no inheritance: the aggregate holds the root in a private field and delegates |
| **Entity inside an aggregate** (not a root) | [`delivery_attempt.rs`](src/contexts/notifications/domain/src/notification/delivery_attempt.rs) | has its own identity, exists only inside `Notification`, reached and persisted through it. The criterion: few, consistent with the root in the same change, written through the root. What grows without bound or is written by others is its own aggregate (comments on a note); created and reached through `Notification` only (`pub(super)`), persisted in its snapshot |
| Value object | [`note_title.rs`](src/contexts/notes/domain/src/note/note_title.rs), [`email.rs`](src/shared_kernel/domain/src/email.rs), [`credentials.rs`](src/contexts/security/domain/src/account/credentials.rs) | built through `create()` → `Result`; never invalid once you hold one; a newtype with a private field deriving `PartialEq`; [`value_object.rs`](src/architecture/domain/src/value_object.rs) names the shape |
| Identity | [`id.rs`](src/architecture/domain/src/id.rs) | generated by the domain (`Id.generate()`), not by the database — [ADR 2](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| Factory | `Note::create()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs); when creation needs a port, [`account_registration.rs`](src/contexts/security/domain/src/account/account_registration.rs) | the aggregate is its own factory: a static `create()` that validates, generates the identity and records the creation event; the constructor is private. When creation needs a collaborator (a port), the factory is a domain service. No `Factory` class |
| Invariant | `share_with()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | a rule that must hold after every change (only the owner, not archived, not twice, not with yourself): checked inside the behaviour, before the state changes and the event is recorded. There is no `validate()` to forget, and no way to reach the state but through the behaviour |
| Creation vs reconstitution | `Note::create()` vs `Note::from_snapshot()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | creation records an event; rebuilding from persistence records nothing — [ADR 4](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md); corrupted storage panics, which is what a throw is here |
| Domain event | [`events.rs`](src/contexts/notes/domain/src/note/events.rs) | past tense, minimal payload, internal to the context; one enum per aggregate, one variant per fact; [`event.rs`](src/architecture/domain/src/event.rs) has the three kinds as traits |
| Domain exception | [`note_exceptions.rs`](src/contexts/notes/domain/src/note/note_exceptions.rs) | a broken rule in business words, carried by `Result.fail()`, never thrown — [ADR 1](../docs/adr/0001-result-instead-of-exceptions.md); a `kind` constant and a constructor function per rule, building an [`Exception`](src/architecture/domain/src/exception.rs) |
| `Result` | [`result.rs`](src/architecture/domain/src/result.rs) | `IResult<T>` is the type you write in signatures; the language's own `Result<T, Exception>`, and `?` where TypeScript wrote `if (r.isFailure()) return r` |
| **Optimistic concurrency** | `AggregateRoot::version` in [`aggregate_root.rs`](src/architecture/domain/src/aggregate_root.rs); `save()` in [`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs) | the aggregate carries the version it was read at and never changes it; the repository stores version + 1 and refuses a stale one with `ConcurrencyConflict`, so of two writers who read the same version only the first wins — [ADR 8](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md) |
| Repository port | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs) | load / save an aggregate; nothing else; a trait whose methods return `impl Future`, so an adapter may be in-memory or a database |
| Queries port & read models | [`note_queries.rs`](src/contexts/notes/domain/src/note/ports/note_queries.rs) | returns view shapes, never aggregates — [ADR 5](../docs/adr/0005-queries-return-read-models-not-aggregates.md) |
| Snapshot DTO | [`dtos.rs`](src/contexts/notes/domain/src/note/dtos.rs) | the plain shape that crosses to the infrastructure |
| **Domain service** | [`account_registration.rs`](src/contexts/security/domain/src/account/account_registration.rs), [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) | a rule about the whole collection ("one account per email") — needs the port, still pure domain; generic over its port, so a test hands it a five-line struct |
| **Port to another context** (read side) | [`account_directory.rs`](src/contexts/notes/domain/src/note/ports/account_directory.rs), used by [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs), answered over Security's read model by [`directories.rs`](src/contexts/notes/infrastructure/src/directories.rs) | Notes asks "does this account exist?" in its own words; only its infrastructure knows Security is next door. The read-side counterpart of the anti-corruption layer for events |
| Ports for technical concerns | [`password_hasher.rs`](src/contexts/security/domain/src/auth/ports/password_hasher.rs), [`signed_tokens.rs`](src/contexts/security/domain/src/auth/ports/signed_tokens.rs) | hashing has a business meaning; the algorithm does not belong here |
| Lifecycle as an enum | [`note_status.rs`](src/contexts/notes/domain/src/note/note_status.rs), [`account_status.rs`](src/contexts/security/domain/src/account/account_status.rs) | the transitions live in the aggregate, not in the enum |
<!-- end generated -->

### Application layer

<!-- generated from conventions/concepts.yaml (application); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Command | `ShareNote` in [`share_note.rs`](src/contexts/notes/application/src/commands/share_note.rs) | a named payload, nothing more. It extends `CommandEvent`, one of the three kinds of message the building blocks define: a command travels on the same bus as the events and is tracked as an operation, so it has their shape; the class says its intent (one handler, may be refused); a struct with a `NAME`, which is the channel its handler listens on, and an `Output`, what its handler answers with; the three kinds of message are three traits in [`event.rs`](src/architecture/domain/src/event.rs) |
| Command handler | `EditNoteCommandHandler` in [`edit_note.rs`](src/contexts/notes/application/src/commands/edit_note.rs) | the shape every "change an existing thing" use case follows; generic over its ports, `Arc`-shared with the other handlers of the aggregate |
| Guard (authorization) | `require_signed_in()` in [`guards.rs`](src/shared_kernel/application/src/guards.rs), called once at the top of `execute()`; `guard()` in [`register_admin.rs`](src/contexts/security/application/src/commands/register_admin.rs) | *who may call* is answered here; *what they may do to which object* is the aggregate's business |
| Application service | [`delivery.rs`](src/contexts/notifications/application/src/delivery.rs) | orchestrates ports for a use case several entry points share; holds no rule of its own; holds the channels through `dyn`, since a strategy walks a list of adapters of different types |
| Base handler (guard, transaction, safety net) | [`command_handler.rs`](src/architecture/application/src/command_handler.rs) | a concrete handler only writes `execute()`; a trait whose provided `handle()` is the template method; a concrete handler writes `execute()` |
| Query handler | [`get_note.rs`](src/contexts/notes/application/src/queries/get_note.rs) | reads through the queries port; a refused query is a failed `Result`, not a throw; a query is a struct, like a command, and the module finds its handler by the query's type (`module.query::<GetNote>()`), never by the handler's, which would name the adapter |
| Execution context | [`execution_context.rs`](src/architecture/application/src/execution_context.rs) | who is calling, with which logger, bus and unit of work; `withTransaction`, `afterCommit`; shared by `Arc`, so a clone is the same context; `after_commit` takes a future |
| Publish after commit | `publish_domain_events()` in [`domain_events.rs`](src/architecture/application/src/domain_events.rs) | [ADR 3](../docs/adr/0003-publish-domain-events-after-commit.md); the handler hands the aggregate over, and the events are pulled at the commit |
| Domain event handler | [`note_shared_handler.rs`](src/contexts/notes/application/src/events/note_shared_handler.rs) | where a fact leaves its context |
| Integration event (published contract) | [`note_integration_events.rs`](src/shared_kernel/application/src/integration_events/note_integration_events.rs) | the only thing one context may know about another — [ADR 6](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md) |
| **Anti-corruption layer** | [`note_shared_handler.rs`](src/contexts/notifications/application/src/events/note_shared_handler.rs) | restates a foreign fact in local terms; one handler per consumed contract, in [`events/`](src/contexts/notifications/application/src/events/mod.rs); each knows the contract and nothing else of the other context |
| **Projection / read model** | [`projection.rs`](src/contexts/tracker/application/src/projection.rs), [`read_model.rs`](src/contexts/tracker/application/src/read_model.rs) | a context with no aggregate at all |
| **Non-determinism as a value** (ADR 7) | [`suggestions.rs`](src/contexts/notes/application/src/suggestions.rs) → [`suggest_note_title.rs`](src/contexts/notes/application/src/commands/suggest_note_title.rs), answered locally by [`infrastructure/suggestions.rs`](src/contexts/notes/infrastructure/src/suggestions.rs) | a decision the domain cannot make from its own state (a model, a heuristic, a person) enters it as a value the aggregate validates and may refuse; the provenance travels with it and ends on the operation — [ADR 7](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md) |
| Module (wiring) | [`module.rs`](src/architecture/application/src/module.rs), used in [`notes/wiring`](src/contexts/notes/wiring/src/lib.rs); what a context exports besides its module is a public item of the same crate ([`security/wiring`](src/contexts/security/wiring/src/lib.rs)) | plain data: which handler answers which command, query, event; the wiring is a crate; a handler is listed with `Subscription::command`, a query with `query()` |
<!-- end generated -->

### Infrastructure layer

<!-- generated from conventions/concepts.yaml (infrastructure); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Repository implementation | [`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs) | snapshot in, snapshot out |
| Queries implementation | [`queries.rs`](src/contexts/notes/infrastructure/src/queries.rs) | builds read models from the same store, here |
| **Second adapter of the same port** | `SqliteNoteRepository` in [`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs) and `SqliteNoteQueries` in [`queries.rs`](src/contexts/notes/infrastructure/src/queries.rs), over the one table of [`notes_table.rs`](src/contexts/notes/infrastructure/src/notes_table.rs) (`rusqlite`, bundled) | the proof that the port is the seam: a real database behind the same interfaces, not one line changed in Domain or Application. The local wiring keeps the in-memory pair; both are held to the same contract spec; the contract test: [`persistence_contract.rs`](src/contexts/notes/infrastructure/src/persistence_contract.rs); the optimistic check is one `UPDATE … WHERE version = ?` |
| Port implementations | [`signed_tokens.rs`](src/contexts/security/infrastructure/src/signed_tokens.rs) (`jsonwebtoken`), [`password_hasher.rs`](src/contexts/security/infrastructure/src/password_hasher.rs) (`bcrypt`), [`channels/websocket.rs`](src/contexts/notifications/infrastructure/src/channels/websocket.rs) (axum's `ws`) |  |
| Event bus | [`event_bus.rs`](src/architecture/infrastructure/src/event_bus.rs) | the only bus implementation; routes by name, awaits the handlers inline; the port is [`event_bus.rs`](src/architecture/application/src/event_bus.rs) |
| Decorator (cross-cutting concern) | [`tracked_event_bus.rs`](src/contexts/tracker/infrastructure/src/tracked_event_bus.rs) | tracking layered on any bus; neither the bus nor the handlers know; wraps `dispatch`: a record before, a record after, the completion notice when it is a command's |
| Unit of work | [`unit_of_work.rs`](src/architecture/infrastructure/src/unit_of_work.rs) | over the stores the composition root lists, rather than every store of the process |
| The "database" | [`data_sources.rs`](src/architecture/infrastructure/src/data_sources.rs) | a `Map`; the ports are what a real adapter would implement; an insertion-ordered map behind a mutex |
<!-- end generated -->

### Presentation and bootstrap

<!-- generated from conventions/concepts.yaml (presentation); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example |
| --- | --- |
| Controller (commands → `202 { operationId }`, queries → sync; one `refuse()` per controller: `403` not allowed, `404` not found, `400` otherwise, always `{ message }`) | [`notes/presentation`](src/contexts/notes/presentation/src/lib.rs); every other context's has the same shape |
| Routes and JSON schemas | the `Router` and the request bodies and views of [`notes/presentation`](src/contexts/notes/presentation/src/lib.rs), on [`architecture/presentation`](src/architecture/presentation/src/lib.rs) (`Accepted`, the refusals) |
| Authentication middleware | [`authentication.rs`](src/contexts/security/presentation/src/authentication.rs) — never blocks, leaves the caller anonymous unless the token verifies; a layer over every route |
| Presenters (one use case, several formats) | [`security/presentation/presenters.rs`](src/contexts/security/presentation/src/presenters.rs), picked per request by [`format.rs`](src/architecture/presentation/src/format.rs) — a `const ByFormat` per answer in the controller, no registry |
| Composition root | [`create_application.rs`](src/bootstrap/src/create_application.rs) on [`application.rs`](src/architecture/application/src/application.rs): wires, starts the modules, seeds the administrator through the same handler as any command, then listens; [`main.rs`](src/bootstrap/src/main.rs) is the process entry point |
<!-- end generated -->

### Tests, one style per layer

<!-- generated from conventions/concepts.yaml (tests); edit the YAML, then run the conventions check with --write -->
| Layer | Example | Doubles |
| --- | --- | --- |
| Domain | `mod tests` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | none |
| Domain service | `mod tests` in [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) | a five-line struct implementing the port |
| Application | `mod tests` in [`commands/mod.rs`](src/contexts/notes/application/src/commands/mod.rs), [`delivery.rs`](src/contexts/notifications/application/src/delivery.rs) | the in-memory repository *is* the double; the in-memory bus, with a recording handler, says what was published; a fake channel remembers what it received |
| Infrastructure | `mod tests` in [`tracked_event_bus.rs`](src/contexts/tracker/infrastructure/src/tracked_event_bus.rs), [`signed_tokens.rs`](src/contexts/security/infrastructure/src/signed_tokens.rs) | real in-memory pieces |
| **Contract** (one port, every adapter) | [`persistence_contract.rs`](src/contexts/notes/infrastructure/src/persistence_contract.rs) | none — every case runs over each entry of `adapters()`, the in-memory and the SQLite pair, same expectations |
| End to end | [`notes_routes.rs`](src/bootstrap/tests/notes_routes.rs) | the whole application, booted in-process on a free port by [`tests/support/mod.rs`](src/bootstrap/tests/support/mod.rs), spoken to over HTTP; a `202` is followed through the Tracker to its outcome |
<!-- end generated -->

## The rules, and how they are enforced

Every rule has a stable id, a reason, a remediation and says how it is held — in the contract's words (`linter`, `check`, `types`, `tests`, `review`, `evaluations`) and, below, in this language's: the crate graph, `cargo run -p conventions`, the compiler, a `#[test]`, review, the evaluations. The rules are the same in every language; the files that show them are this language's. Ask any of them from `typescript/`: `yarn architecture rule CONC-OPTIMISTIC`.

<!-- generated from conventions/architecture.yaml (rules); edit the YAML, then run the conventions check with --write -->
| Rule | Enforced by |
| --- | --- |
| **ARCH-RELATIVE** — A relative import names a sibling file and nothing else; anything across directories goes through the path the import rules are written against. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [CLAUDE.md](CLAUDE.md) |
| **ARCH-INWARD** — Dependencies point inward and contexts stay apart — each file imports only what its row of the dependency table allows; there is no exception and none may be added. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [architecture.yaml](../conventions/architecture.yaml), [README.md](../conventions/README.md), [Cargo.toml](src/contexts/notes/domain/Cargo.toml), [Cargo.toml](src/contexts/notes/application/Cargo.toml), [Cargo.toml](src/contexts/notes/presentation/Cargo.toml) |
| **ARCH-TREES** — The building blocks import nothing outside themselves, not even the shared kernel; the shared kernel imports the building blocks and no context. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [architecture](src/architecture), [shared_kernel](src/shared_kernel) |
| **ARCH-CONTEXT-DECLARED** — Every directory under the contexts tree is a context declared in the language's binding, holds only the declared layers and its wiring file. | `cargo run -p conventions` · [README.md](../conventions/README.md) |
| **ARCH-MODULES-DATA** — A context's wiring is one file building a Module as data — its name, its commands, its queries, its domain event and integration event handlers; anything else it exposes is a named export of that file. No container, no builder, no service locator. | review (stated here, not yet mechanical) · [lib.rs](src/contexts/notes/wiring/src/lib.rs) |
| **ARCH-EXECUTION-CONTEXT** — ExecutionContext carries what exists per request and nothing else — who is calling, the trace, the transaction, the bus, the logger. A mailer, a clock, a model client is a constructor dependency of the handler that needs it. | review (stated here, not yet mechanical) · [execution_context.rs](src/architecture/application/src/execution_context.rs) |
| **DOMAIN-RESULT** — A refused command or query is a failed Result value, never a thrown exception; throwing (or panicking) is for programming errors and corrupted state only. | a `#[test]` · [0001-result-instead-of-exceptions.md](../docs/adr/0001-result-instead-of-exceptions.md), [result.rs](src/architecture/domain/src/result.rs), [command_handler.rs](src/architecture/application/src/command_handler.rs) |
| **DOMAIN-RECORDS-EVENTS** — Only an aggregate root records domain events (`record(...)` inside a behaviour); handlers never construct one, they call `publishDomainEvents(aggregate, context)` after saving. | the compiler · [aggregate_root.rs](src/architecture/domain/src/aggregate_root.rs) |
| **DOMAIN-CREATE-VS-RECONSTITUTE** — `create()` / `register()` validates and records a creation event; `fromSnapshot()` records nothing and throws on corrupted data. | a `#[test]` · [0004-reconstitution-throws-on-corrupted-data.md](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md), [mod.rs](src/contexts/notes/domain/src/note/mod.rs) |
| **DOMAIN-IDENTITY** — An aggregate generates its own identity (`Id.generate()` in `create()`). A repository loads and saves aggregates, and answers the facts a domain rule needs about the collection (`findByEmail`, `countByOwner`); it never hands out identities and never searches for a screen. | review (stated here, not yet mechanical) · [0002-identity-is-generated-by-the-domain.md](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| **DOMAIN-NON-DETERMINISM** — Time is a parameter with a default; identity is generated by the domain; anything else that is not a function of the business state (randomness, a model, a person, another system) lives behind a port named for what it decides, and its result is a plain value the aggregate validates and may refuse. | review (stated here, not yet mechanical) · [0007-non-determinism-enters-the-domain-as-a-value.md](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md), [suggest_note_title.rs](src/contexts/notes/application/src/commands/suggest_note_title.rs) |
| **EVENT-AFTER-COMMIT** — Domain events are made durable with the state they describe, in the same transaction (the outbox), and published from there after the commit — never before, and never from memory alone; a rolled-back transaction stores nothing and leaves the events on the aggregate; a fact a crash kept from being published is published on the next relay, so a subscriber may see a fact twice and the bus delivers a message it already delivered once only. | a `#[test]` · [0003-publish-domain-events-after-commit.md](../docs/adr/0003-publish-domain-events-after-commit.md), [0024-events-are-durable-before-they-are-published.md](../docs/adr/0024-events-are-durable-before-they-are-published.md), [domain_events.rs](src/architecture/application/src/domain_events.rs) |
| **QUERY-READ-MODELS** — Queries return read models, repositories return aggregates; never the other way. | the compiler · [0005-queries-return-read-models-not-aggregates.md](../docs/adr/0005-queries-return-read-models-not-aggregates.md) |
| **CTX-CONTRACTS** — Contexts talk in two ways only — integration events published in the shared kernel, and ports the asking side owns, answered by an adapter over the other context's read model; a context's Domain never imports another context. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md), [directories.rs](src/contexts/notes/infrastructure/src/directories.rs), [note_shared_handler.rs](src/contexts/notes/application/src/events/note_shared_handler.rs), [note_shared_handler.rs](src/contexts/notifications/application/src/events/note_shared_handler.rs) |
| **CONC-OPTIMISTIC** — An aggregate carries the version it was read at and never changes it; `save()` stores version + 1 and refuses an aggregate that is no longer at the stored version with a ConcurrencyConflictException; the command handler then re-reads and re-decides in a new transaction, up to three attempts, and the third conflict is the operation's refusal. | a `#[test]` · [0008-optimistic-concurrency-on-the-aggregate.md](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md), [0025-a-conflict-is-retried-from-a-fresh-read-then-refused.md](../docs/adr/0025-a-conflict-is-retried-from-a-fresh-read-then-refused.md), [repositories.rs](src/contexts/notes/infrastructure/src/repositories.rs) |
| **ARCH-MAP-IS-REAL** — Every file the concept map names exists, every documentation link resolves, nothing silences the linter, and the generated import rules refuse and allow what the probes say. | `cargo run -p conventions` · [concepts.yaml](../conventions/concepts.yaml), [main.rs](tools/conventions/src/main.rs) |
| **ARCH-LEARNABLE** — A newcomer, or an agent, can add a feature in the right shape from the documentation alone. | fresh-agent evaluations · [README.md](../docs/evaluations/README.md) |
| **ARCH-ONE-CONTRACT** — Every language the reference is written in is held to this file — the same layers, the same rules under the same ids, the same HTTP grammar — through a binding that says where its trees are and which file shows each concept; a language never carries a rule of its own. | `cargo run -p conventions` · [0011-one-reference-several-languages.md](../docs/adr/0011-one-reference-several-languages.md), [README.md](../conventions/README.md) |
| **API-ONE-SURFACE** — Every language answers the same HTTP API — the same routes, status codes, body shapes and public names — so one black-box scenario, run against each server, passes unchanged; the public name of an operation is its intent or its fact without the suffix of its kind (`ShareNote`, `NoteShared`). | a `#[test]` · [0016-one-api-for-every-language.md](../docs/adr/0016-one-api-for-every-language.md), [projection.rs](src/contexts/tracker/application/src/projection.rs), [operation_routes.rs](src/bootstrap/tests/operation_routes.rs) |
| **CTX-MAP-DECLARED** — Every relationship between two contexts is declared once in the context map, with the strategic pattern it follows, the mechanism that carries it and why; the contracts it carries are read from the code, and the check refuses a link in the code the map does not declare and a declared relationship nothing in the code carries. | `cargo run -p conventions` · [0019-the-domain-is-data.md](../docs/adr/0019-the-domain-is-data.md), [README.md](../conventions/README.md) |
| **ARCH-ONE-APPLICATION** — Every language's tree says the same application, in words every language shares — the commands of each context with who may call them, their route, the aggregate they reach and the events it records; the queries; the domain events; the policies and what they publish or reach; the links between contexts; each language's tool writes that inventory from its own tree, and the check holds the inventories equal. | `cargo run -p conventions` · [0021-one-application-every-language-writes-the-same-inventory.md](../docs/adr/0021-one-application-every-language-writes-the-same-inventory.md), [README.md](../conventions/README.md), [inventory.rs](tools/conventions/src/inventory.rs) |
<!-- end generated -->

### Who may import whom

The dependency table, per layer. `own` is the crate's own context, `architecture` the building blocks, `kernel` the shared kernel, `others` any other context; a crate's `[dependencies]` are its row, and `cargo run -p conventions` refuses a dependency the row does not allow, naming the rule.

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
Cargo.toml                        the workspace: one member per layer crate, plus tools/
src/architecture/
  domain/                         crate architecture-domain: Entity, Aggregate + AggregateRoot, ValueObject, Id, the three
                                  kinds of Event, Exception, DomainResult — depends on nothing
  application/                    crate architecture-application: CommandHandler, QueryHandler, EventHandler,
                                  ExecutionContext, EventBus, Operation, Module, Application, publish_domain_events
  infrastructure/                 crate architecture-infrastructure: InMemoryDataSource, InMemoryEventBus,
                                  InMemoryUnitOfWork, ConsoleLogger
  presentation/                   crate architecture-presentation: accept() — the 202 and the spawned dispatch —
                                  the refusals (status_of, refused), and format.rs (Format, Presenter, ByFormat)
src/shared_kernel/
  domain/                         crate shared-kernel-domain: Email, Role
  application/                    crate shared-kernel-application: require_signed_in, integration_events/ (notes,
                                  accounts, tracker)
src/contexts/notes/
  domain/                         crate notes-domain
    src/note/mod.rs               the aggregate, with its tests
    src/note/note_title.rs        value object            src/note/events.rs            domain events
    src/note/note_status.rs       lifecycle               src/note/note_exceptions.rs   broken rules, in business words
    src/note/dtos.rs              the snapshot shape      src/note/note_sharing.rs      domain service
    src/note/ports/               note_repository (write), note_queries (read models), account_directory (another context)
  application/                    crate notes-application
    src/commands/<use_case>.rs    the command and its handler; the tests of them all at the bottom of commands/mod.rs
    src/queries/<use_case>.rs     the query and its handler                src/events/   reactions
    src/suggestions.rs            the port for a decision the domain cannot make (ADR 7)
  infrastructure/                 crate notes-infrastructure: repositories.rs and queries.rs (the in-memory and the
                                  SQLite adapters), notes_table.rs, suggestions.rs, directories.rs (over Security's
                                  read model), persistence_contract.rs (one port, every adapter)
  presentation/                   crate notes-presentation: note_routes(), the routes, their bodies and views, the
                                  new-note form
  wiring/                         crate notes-wiring: local_notes_module(), the Module as data
src/contexts/security/            the same five crates: account/ (aggregate, registration, credentials, ports),
                                  auth/ (the token and hasher ports), the four commands, the query, the two
                                  reactions, bcrypt and JWT adapters, auth_routes() and the authentication layer,
                                  local_security_module() exporting the read model, the layer and the seed
src/contexts/notifications/       the five crates: notification/ (the aggregate, the delivery attempt inside it, the
                                  strategy, the channel and queries ports), delivery.rs (the application service),
                                  the two commands, the inbox query, events/ (the anti-corruption handlers),
                                  the email and websocket channels, notification_routes() and render(), the wiring
                                  exporting the websocket channel whose /ws route the bootstrap serves
src/contexts/tracker/             no Domain: application/ (read_model, ports, projection, the two queries),
                                  infrastructure/ (the records, TrackedEventBus), presentation/, wiring/
src/bootstrap/                    crate bootstrap: settings.rs, create_application.rs (the composition root),
                                  home.rs (the API's home, in two formats), main.rs (cargo run -p bootstrap),
                                  tests/ (the end-to-end suites, over HTTP)
tools/conventions/                cargo run -p conventions: the graph is the table, the tree is the contract's
```

## Running it

Requires a stable Rust toolchain with `rustfmt` and `clippy` (edition 2024, Rust ≥ 1.85). Everything runs from this directory.

```bash
cd rust
cargo run -p conventions                    # the crate graph is the table, the tree matches the binding, every named file exists, the inventory is current
cargo run -p conventions -- inventory       # the inventory read from this tree (docs/inventory/rust.json), in the words every language shares
cargo run -p conventions -- inventory --write   # writes it; the check refuses a committed inventory the tree no longer renders
cargo fmt --check                           # rustfmt, as CI runs it
cargo clippy --all-targets -- -D warnings   # the lints, warnings refused
cargo test                                  # every #[test] in every crate, the end-to-end suites of src/bootstrap/tests included
cargo run -p bootstrap                      # serves on http://127.0.0.1:10000/v1 (PORT, API_PREFIX, JWT_SECRET, ADMIN_IDENTIFIER, ADMIN_PASSWORD)
node ../api/scenario.mjs http://127.0.0.1:10000   # the API every language answers, walked against that server
```

Then, as a client would: `POST /v1/auth/login` with `{ "identifier": "admin@admin.fr", "password": "admin" }` answers a token; `POST /v1/notes` with it answers `202 { operationId }`; `GET /v1/tracker/operations/<operationId>` says how it went; `GET /v1/notes` lists the note. Or as a browser would: open `http://127.0.0.1:10000/`, log in, write a note, and watch the outcome arrive over the websocket. The documents of this directory are rendered from the contract by the TypeScript tooling, which reads every binding: after editing `conventions/rust.yaml`, run `yarn --cwd ../typescript conventions:write`.

## Vocabulary

The words the reference uses, with the file that shows them here; a word with no file yet is one this language still owes.

<!-- generated from conventions/concepts.yaml (vocabulary); edit the YAML, then run the conventions check with --write -->
| Word | Here it means | See |
| --- | --- | --- |
| Building blocks | the mechanics every context is written with (Entity, AggregateRoot, ValueObject, Result, the handlers, the bus); they know no context and no vocabulary, not even the roles | [`src/architecture`](src/architecture) |
| Shared kernel | the part of the domain model every context agrees on — Email, Role, who counts as signed in, and the integration events; not the base classes, which is what the word is often misused for | [`src/shared_kernel`](src/shared_kernel) |
| Bounded context | a folder with its own vocabulary and wiring, talking to others through integration events and ports it owns only; its purpose, its language and its relationships are in the domain map | [`src/contexts`](src/contexts) |
| Aggregate (root) | the object that owns a consistency boundary: every change goes through one of its behaviours, which checks the invariants and records an event | [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) |
| Entity | an object with an identity that outlives its attributes | [`entity.rs`](src/architecture/domain/src/entity.rs) |
| Value object | an object without identity, compared by value, valid from the moment it exists | [`note_title.rs`](src/contexts/notes/domain/src/note/note_title.rs) |
| Invariant | a rule that must hold after every change of an aggregate | `share_with()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) |
| Domain event | a fact, in the past tense, recorded by an aggregate for the rest of the system | [`events.rs`](src/contexts/notes/domain/src/note/events.rs) |
| Integration event | a fact restated as a published contract for other contexts | [`note_integration_events.rs`](src/shared_kernel/application/src/integration_events/note_integration_events.rs) |
| Command | a request that something happen; one handler; may be refused | `ShareNote` in [`share_note.rs`](src/contexts/notes/application/src/commands/share_note.rs) |
| Query | a question; answered from a read model; changes nothing | [`get_note.rs`](src/contexts/notes/application/src/queries/get_note.rs) |
| Read model | a shape built for reading, not an aggregate | [`note_queries.rs`](src/contexts/notes/domain/src/note/ports/note_queries.rs) |
| Projection | a read model fed by events | [`projection.rs`](src/contexts/tracker/application/src/projection.rs) |
| Port | an interface the domain or the application declares in its own words, for something outside | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs), [`account_directory.rs`](src/contexts/notes/domain/src/note/ports/account_directory.rs) |
| Adapter | the implementation of a port, in the infrastructure | [`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs), [`suggestions.rs`](src/contexts/notes/infrastructure/src/suggestions.rs), [`directories.rs`](src/contexts/notes/infrastructure/src/directories.rs) |
| Repository | the port that loads and saves one aggregate by identity | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs) |
| Domain service | a business rule that spans several aggregates or needs a port | [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) |
| Application service | orchestration shared by several entry points; no rule of its own | [`delivery.rs`](src/contexts/notifications/application/src/delivery.rs) |
| Anti-corruption layer | the handler that translates a foreign contract into local terms | [`note_shared_handler.rs`](src/contexts/notifications/application/src/events/note_shared_handler.rs) |
| Snapshot | the plain shape of an aggregate that crosses to the infrastructure | [`dtos.rs`](src/contexts/notes/domain/src/note/dtos.rs) |
| Operation | the handle a client gets for a command: its status and outcome. The Tracker records one for every message on the bus, events included, so a trace shows what a command set off | [`operation.rs`](src/architecture/application/src/operation.rs) |
| Composition root | the one file that knows every context and builds the application | [`create_application.rs`](src/bootstrap/src/create_application.rs) |
<!-- end generated -->

## Known gaps

- **The SQLite adapters are not wired.** The local wiring keeps the in-memory pair, as in TypeScript; the unit of work snapshots the in-memory stores only, so a SQLite deployment would bring its own unit of work over the connection's transactions, behind the same port.
- **The bus awaits the handlers inline**, so a command is handled before `publish` answers; `accept()` answers the `202` first and spawns the dispatch (ADR 14). A client that reads right after a `202` may be early: the end-to-end tests follow the operation through the Tracker, as a client should.
- **The in-memory unit of work takes the stores it guards as a list**, which the composition root builds; there is no registry of every store of the process as in TypeScript. Its honest limit is the same: a transaction boundary, not isolation.
