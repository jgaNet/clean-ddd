# Clean Architecture & DDD, the Rust implementation

The Rust rendering of the [reference](../README.md): the same application, the same architecture ([`conventions/`](../conventions/README.md)), the same decisions ([`docs/adr`](../docs/adr)), under the same rules and the same ids. This page is about this directory, and every command on it runs from here.

**What is here today**: the building blocks' Domain, Application and Infrastructure, the shared kernel's Domain and Application, and the Notes context from its Domain to its wiring — the aggregate and everything around it, the six commands, the three queries, the two reactions, the in-memory adapters, the contract test and the `notes-wiring` crate that lists them in a `Module`. The Presentation layer and the composition root are not written yet, and neither are the other three contexts; the [map in the root README](../README.md#the-map-concept--language) shows each concept this language still owes as a dash, and nothing on this page claims otherwise.

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

## The map: concept → file

One canonical example per concept, rendered from [`conventions/concepts.yaml`](../conventions/concepts.yaml) — the concepts, shared with every language — and [`conventions/rust.yaml`](../conventions/rust.yaml), this language's binding, which names the file that shows each; CI checks that every file they name exists. The Presentation layer has no files yet.

### Domain layer

<!-- generated from conventions/concepts.yaml (domain); edit the YAML, then run yarn conventions:write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Entity | [`entity.rs`](src/architecture/domain/src/entity.rs) | identity, `equals()`; a trait; the kind is the type, so two kinds cannot even be compared |
| Aggregate root | [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) holding an [`AggregateRoot`](src/architecture/domain/src/aggregate_root.rs) | behaviours enforce invariants and `record()` events; no inheritance: the aggregate holds the root in a private field and delegates |
| Value object | [`note_title.rs`](src/contexts/notes/domain/src/note/note_title.rs), [`email.rs`](src/shared_kernel/domain/src/email.rs) | built through `create()` → `Result`; never invalid once you hold one; a newtype with a private field deriving `PartialEq`; [`value_object.rs`](src/architecture/domain/src/value_object.rs) names the shape |
| Identity | [`id.rs`](src/architecture/domain/src/id.rs) | generated by the domain (`Id.generate()`), not by the database — [ADR 2](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| Factory | `Note::create()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | the aggregate is its own factory: a static `create()` that validates, generates the identity and records the creation event; the constructor is private. When creation needs a collaborator (a port), the factory is a domain service. No `Factory` class; the domain-service factory (an account's registration) is not written yet |
| Invariant | `share_with()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | a rule that must hold after every change (only the owner, not archived, not twice, not with yourself): checked inside the behaviour, before the state changes and the event is recorded. There is no `validate()` to forget, and no way to reach the state but through the behaviour |
| Creation vs reconstitution | `Note::create()` vs `Note::from_snapshot()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | creation records an event; rebuilding from persistence records nothing — [ADR 4](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md); corrupted storage panics, which is what a throw is here |
| Domain event | [`events.rs`](src/contexts/notes/domain/src/note/events.rs) | past tense, minimal payload, internal to the context; one enum per aggregate, one variant per fact; [`event.rs`](src/architecture/domain/src/event.rs) has the three kinds as traits |
| Domain exception | [`note_exceptions.rs`](src/contexts/notes/domain/src/note/note_exceptions.rs) | a broken rule in business words, carried by `Result.fail()`, never thrown — [ADR 1](../docs/adr/0001-result-instead-of-exceptions.md); a `kind` constant and a constructor function per rule, building an [`Exception`](src/architecture/domain/src/exception.rs) |
| `Result` | [`result.rs`](src/architecture/domain/src/result.rs) | `IResult<T>` is the type you write in signatures; the language's own `Result<T, Exception>`, and `?` where TypeScript wrote `if (r.isFailure()) return r` |
| **Optimistic concurrency** | `AggregateRoot::version` in [`aggregate_root.rs`](src/architecture/domain/src/aggregate_root.rs); `save()` in [`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs) | the aggregate carries the version it was read at and never changes it; the repository stores version + 1 and refuses a stale one with `ConcurrencyConflict`, so of two writers who read the same version only the first wins — [ADR 8](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md) |
| Repository port | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs) | load / save an aggregate; nothing else; a trait whose methods return `impl Future`, so an adapter may be in-memory or a database |
| Queries port & read models | [`note_queries.rs`](src/contexts/notes/domain/src/note/ports/note_queries.rs) | returns view shapes, never aggregates — [ADR 5](../docs/adr/0005-queries-return-read-models-not-aggregates.md) |
| Snapshot DTO | [`dtos.rs`](src/contexts/notes/domain/src/note/dtos.rs) | the plain shape that crosses to the infrastructure |
| **Domain service** | [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) | a rule about the whole collection ("one account per email") — needs the port, still pure domain; generic over its port, so a test hands it a five-line struct |
| **Port to another context** (read side) | [`account_directory.rs`](src/contexts/notes/domain/src/note/ports/account_directory.rs), used by [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) | Notes asks "does this account exist?" in its own words; only its infrastructure knows Security is next door. The read-side counterpart of the anti-corruption layer for events; the adapter over Security's read model is not written yet |
| Lifecycle as an enum | [`note_status.rs`](src/contexts/notes/domain/src/note/note_status.rs) | the transitions live in the aggregate, not in the enum |
<!-- end generated -->

### Application layer

<!-- generated from conventions/concepts.yaml (application); edit the YAML, then run yarn conventions:write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Command | `ShareNote` in [`share_note.rs`](src/contexts/notes/application/src/commands/share_note.rs) | a named payload, nothing more. It extends `CommandEvent`, one of the three kinds of message the building blocks define: a command travels on the same bus as the events and is tracked as an operation, so it has their shape; the class says its intent (one handler, may be refused); a struct with a `NAME`, which is the channel its handler listens on; the three kinds of message are three traits in [`event.rs`](src/architecture/domain/src/event.rs) |
| Command handler | `EditNoteCommandHandler` in [`edit_note.rs`](src/contexts/notes/application/src/commands/edit_note.rs) | the shape every "change an existing thing" use case follows; generic over its ports, `Arc`-shared with the other handlers of the aggregate |
| Guard (authorization) | `require_signed_in()` in [`guards.rs`](src/shared_kernel/application/src/guards.rs), called once at the top of `execute()` | *who may call* is answered here; *what they may do to which object* is the aggregate's business; a `guard()` override for a role-only rule is not written yet |
| Base handler (guard, transaction, safety net) | [`command_handler.rs`](src/architecture/application/src/command_handler.rs) | a concrete handler only writes `execute()`; a trait whose provided `handle()` is the template method; a concrete handler writes `execute()` |
| Query handler | [`get_note.rs`](src/contexts/notes/application/src/queries/get_note.rs) | reads through the queries port; a refused query is a failed `Result`, not a throw |
| Execution context | [`execution_context.rs`](src/architecture/application/src/execution_context.rs) | who is calling, with which logger, bus and unit of work; `withTransaction`, `afterCommit`; shared by `Arc`, so a clone is the same context; `after_commit` takes a future |
| Publish after commit | `publish_domain_events()` in [`domain_events.rs`](src/architecture/application/src/domain_events.rs) | [ADR 3](../docs/adr/0003-publish-domain-events-after-commit.md); the handler hands the aggregate over, and the events are pulled at the commit |
| Domain event handler | [`note_shared_handler.rs`](src/contexts/notes/application/src/events/note_shared_handler.rs) | where a fact leaves its context |
| Integration event (published contract) | [`note_integration_events.rs`](src/shared_kernel/application/src/integration_events/note_integration_events.rs) | the only thing one context may know about another — [ADR 6](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md) |
| **Non-determinism as a value** (ADR 7) | [`suggestions.rs`](src/contexts/notes/application/src/suggestions.rs) → [`suggest_note_title.rs`](src/contexts/notes/application/src/commands/suggest_note_title.rs), answered locally by [`infrastructure/suggestions.rs`](src/contexts/notes/infrastructure/src/suggestions.rs) | a decision the domain cannot make from its own state (a model, a heuristic, a person) enters it as a value the aggregate validates and may refuse; the provenance travels with it and ends on the operation — [ADR 7](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md) |
| Module (wiring) | [`module.rs`](src/architecture/application/src/module.rs), used in [`notes/wiring`](src/contexts/notes/wiring/src/lib.rs) | plain data: which handler answers which command, query, event; the wiring is a crate; a handler is listed with `Subscription::command`, a query with `query()` |
<!-- end generated -->

### Infrastructure layer

<!-- generated from conventions/concepts.yaml (infrastructure); edit the YAML, then run yarn conventions:write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Repository implementation | [`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs) | snapshot in, snapshot out |
| Queries implementation | [`queries.rs`](src/contexts/notes/infrastructure/src/queries.rs) | builds read models from the same store, here |
| Event bus | [`event_bus.rs`](src/architecture/infrastructure/src/event_bus.rs) | the only bus implementation; routes by name, awaits the handlers inline; the port is [`event_bus.rs`](src/architecture/application/src/event_bus.rs) |
| Unit of work | [`unit_of_work.rs`](src/architecture/infrastructure/src/unit_of_work.rs) | over the stores the composition root lists, rather than every store of the process |
| The "database" | [`data_sources.rs`](src/architecture/infrastructure/src/data_sources.rs) | a `Map`; the ports are what a real adapter would implement; an insertion-ordered map behind a mutex |
<!-- end generated -->

### Tests, one style per layer

<!-- generated from conventions/concepts.yaml (tests); edit the YAML, then run yarn conventions:write -->
| Layer | Example | Doubles |
| --- | --- | --- |
| Domain | `mod tests` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | none |
| Domain service | `mod tests` in [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) | a five-line struct implementing the port |
| Application | `mod tests` in [`commands/mod.rs`](src/contexts/notes/application/src/commands/mod.rs) | the in-memory repository *is* the double; the in-memory bus, with a recording handler, says what was published |
| Infrastructure | `mod tests` in [`in_memory_unit_of_work`](src/architecture/infrastructure/src/unit_of_work.rs) | real in-memory pieces |
| **Contract** (one port, every adapter) | [`persistence_contract.rs`](src/contexts/notes/infrastructure/src/persistence_contract.rs) | none — every case runs over each entry of `adapters()`, same expectations |
<!-- end generated -->

## The rules, and how they are enforced

Every rule has a stable id, a reason, a remediation and says how it is held — in the contract's words (`linter`, `check`, `types`, `tests`, `review`, `evaluations`) and, below, in this language's: the crate graph, `cargo run -p conventions`, the compiler, a `#[test]`, review, the evaluations. The rules are the same in every language; the files that show them are this language's. Ask any of them from `typescript/`: `yarn architecture rule CONC-OPTIMISTIC`.

<!-- generated from conventions/architecture.yaml (rules); edit the YAML, then run yarn conventions:write -->
| Rule | Enforced by |
| --- | --- |
| **ARCH-RELATIVE** — A relative import names a sibling file and nothing else; anything across directories goes through the path the import rules are written against. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [CLAUDE.md](CLAUDE.md) |
| **ARCH-INWARD** — Dependencies point inward and contexts stay apart — each file imports only what its row of the dependency table allows; there is no exception and none may be added. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [architecture.yaml](../conventions/architecture.yaml), [README.md](../conventions/README.md), [Cargo.toml](src/contexts/notes/domain/Cargo.toml), [Cargo.toml](src/contexts/notes/application/Cargo.toml) |
| **ARCH-TREES** — The building blocks import nothing outside themselves, not even the shared kernel; the shared kernel imports the building blocks and no context. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [architecture](src/architecture), [shared_kernel](src/shared_kernel) |
| **ARCH-CONTEXT-DECLARED** — Every directory under the contexts tree is a context declared in the language's binding, holds only the declared layers and its wiring file. | `cargo run -p conventions` · [README.md](../conventions/README.md) |
| **ARCH-MODULES-DATA** — A context's wiring is one file building a Module as data — its name, its commands, its queries, its domain event and integration event handlers; anything else it exposes is a named export of that file. No container, no builder, no service locator. | review (stated here, not yet mechanical) · [lib.rs](src/contexts/notes/wiring/src/lib.rs) |
| **ARCH-EXECUTION-CONTEXT** — ExecutionContext carries what exists per request and nothing else — who is calling, the trace, the transaction, the bus, the logger. A mailer, a clock, a model client is a constructor dependency of the handler that needs it. | review (stated here, not yet mechanical) · [execution_context.rs](src/architecture/application/src/execution_context.rs) |
| **DOMAIN-RESULT** — A refused command or query is a failed Result value, never a thrown exception; throwing (or panicking) is for programming errors and corrupted state only. | a `#[test]` · [0001-result-instead-of-exceptions.md](../docs/adr/0001-result-instead-of-exceptions.md), [result.rs](src/architecture/domain/src/result.rs), [command_handler.rs](src/architecture/application/src/command_handler.rs) |
| **DOMAIN-RECORDS-EVENTS** — Only an aggregate root records domain events (`record(...)` inside a behaviour); handlers never construct one, they call `publishDomainEvents(aggregate, context)` after saving. | the compiler · [aggregate_root.rs](src/architecture/domain/src/aggregate_root.rs) |
| **DOMAIN-CREATE-VS-RECONSTITUTE** — `create()` / `register()` validates and records a creation event; `fromSnapshot()` records nothing and throws on corrupted data. | a `#[test]` · [0004-reconstitution-throws-on-corrupted-data.md](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md), [mod.rs](src/contexts/notes/domain/src/note/mod.rs) |
| **DOMAIN-IDENTITY** — An aggregate generates its own identity (`Id.generate()` in `create()`). A repository loads and saves aggregates, and answers the facts a domain rule needs about the collection (`findByEmail`, `countByOwner`); it never hands out identities and never searches for a screen. | review (stated here, not yet mechanical) · [0002-identity-is-generated-by-the-domain.md](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| **DOMAIN-NON-DETERMINISM** — Time is a parameter with a default; identity is generated by the domain; anything else that is not a function of the business state (randomness, a model, a person, another system) lives behind a port named for what it decides, and its result is a plain value the aggregate validates and may refuse. | review (stated here, not yet mechanical) · [0007-non-determinism-enters-the-domain-as-a-value.md](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md), [suggest_note_title.rs](src/contexts/notes/application/src/commands/suggest_note_title.rs) |
| **EVENT-AFTER-COMMIT** — Domain events are published after the transaction commits, never before; a rolled-back transaction publishes nothing and leaves the events on the aggregate. | a `#[test]` · [0003-publish-domain-events-after-commit.md](../docs/adr/0003-publish-domain-events-after-commit.md), [domain_events.rs](src/architecture/application/src/domain_events.rs) |
| **QUERY-READ-MODELS** — Queries return read models, repositories return aggregates; never the other way. | the compiler · [0005-queries-return-read-models-not-aggregates.md](../docs/adr/0005-queries-return-read-models-not-aggregates.md) |
| **CTX-CONTRACTS** — Contexts talk in two ways only — integration events published in the shared kernel, and ports the asking side owns, answered by an adapter over the other context's read model; a context's Domain never imports another context. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md) |
| **CONC-OPTIMISTIC** — An aggregate carries the version it was read at and never changes it; `save()` stores version + 1 and refuses an aggregate that is no longer at the stored version with a ConcurrencyConflictException. | a `#[test]` · [0008-optimistic-concurrency-on-the-aggregate.md](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md), [repositories.rs](src/contexts/notes/infrastructure/src/repositories.rs) |
| **ARCH-MAP-IS-REAL** — Every file the concept map names exists, every documentation link resolves, nothing silences the linter, and the generated import rules refuse and allow what the probes say. | `cargo run -p conventions` · [concepts.yaml](../conventions/concepts.yaml), [main.rs](tools/conventions/src/main.rs) |
| **ARCH-LEARNABLE** — A newcomer, or an agent, can add a feature in the right shape from the documentation alone. | fresh-agent evaluations · [README.md](../docs/evaluations/README.md) |
| **ARCH-ONE-CONTRACT** — Every language the reference is written in is held to this file — the same layers, the same rules under the same ids, the same HTTP grammar — through a binding that says where its trees are and which file shows each concept; a language never carries a rule of its own. | `cargo run -p conventions` · [0011-one-reference-several-languages.md](../docs/adr/0011-one-reference-several-languages.md), [README.md](../conventions/README.md) |
<!-- end generated -->

### Who may import whom

The dependency table, per layer. `own` is the crate's own context, `architecture` the building blocks, `kernel` the shared kernel, `others` any other context; a crate's `[dependencies]` are its row, and `cargo run -p conventions` refuses a dependency the row does not allow, naming the rule.

<!-- generated from conventions/architecture.yaml (dependencies); edit the YAML, then run yarn conventions:write -->
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
src/shared_kernel/
  domain/                         crate shared-kernel-domain: Email, Role
  application/                    crate shared-kernel-application: require_signed_in, integration_events/
src/contexts/notes/
  domain/                         crate notes-domain
    src/note/mod.rs               the aggregate, with its tests
    src/note/note_title.rs        value object            src/note/events.rs            domain events
    src/note/note_status.rs       lifecycle               src/note/note_exceptions.rs   broken rules, in business words
    src/note/dtos.rs              the snapshot shape      src/note/note_sharing.rs      domain service
    src/note/ports/               note_repository (write), note_queries (read models), account_directory (another context)
  application/                    crate notes-application
    src/commands/<use_case>.rs    the command and its handler; the tests of them all at the bottom of commands/mod.rs
    src/queries/<use_case>.rs     query handlers          src/events/                   reactions
    src/suggestions.rs            the port for a decision the domain cannot make (ADR 7)
  infrastructure/                 crate notes-infrastructure: repositories.rs, queries.rs, suggestions.rs,
                                  persistence_contract.rs (one port, every adapter)
  wiring/                         crate notes-wiring: local_notes_module(), the Module as data
tools/conventions/                cargo run -p conventions: the graph is the table, the tree is the contract's
```

A context's Presentation layer to come is a crate beside these, with its row of the table as `[dependencies]`; the composition root goes in `src/bootstrap`.

## Running it

Requires a stable Rust toolchain with `rustfmt` and `clippy` (edition 2024, Rust ≥ 1.85). Everything runs from this directory.

```bash
cd rust
cargo run -p conventions                    # the crate graph is the table, the tree matches the binding, every named file exists
cargo fmt --check                           # rustfmt, as CI runs it
cargo clippy --all-targets -- -D warnings   # the lints, warnings refused
cargo test                                  # every #[test], in every crate
```

There is no server to start yet. The documents of this directory are rendered from the contract by the TypeScript tooling, which reads every binding: after editing `conventions/rust.yaml`, run `yarn --cwd ../typescript conventions:write`.

## Vocabulary

The words the reference uses, with the file that shows them here; a word with no file yet is one this language still owes.

<!-- generated from conventions/concepts.yaml (vocabulary); edit the YAML, then run yarn conventions:write -->
| Word | Here it means | See |
| --- | --- | --- |
| Building blocks | the mechanics every context is written with (Entity, AggregateRoot, ValueObject, Result, the handlers, the bus); they know no context and no vocabulary, not even the roles | [`src/architecture`](src/architecture) |
| Shared kernel | the part of the domain model every context agrees on — Email, Role, who counts as signed in, and the integration events; not the base classes, which is what the word is often misused for | [`src/shared_kernel`](src/shared_kernel) |
| Bounded context | a folder with its own vocabulary and wiring, talking to others through integration events only | [`src/contexts`](src/contexts) |
| Aggregate (root) | the object that owns a consistency boundary: every change goes through one of its behaviours, which checks the invariants and records an event | [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) |
| Entity | an object with an identity that outlives its attributes | [`entity.rs`](src/architecture/domain/src/entity.rs) |
| Value object | an object without identity, compared by value, valid from the moment it exists | [`note_title.rs`](src/contexts/notes/domain/src/note/note_title.rs) |
| Invariant | a rule that must hold after every change of an aggregate | `share_with()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) |
| Domain event | a fact, in the past tense, recorded by an aggregate for the rest of the system | [`events.rs`](src/contexts/notes/domain/src/note/events.rs) |
| Integration event | a fact restated as a published contract for other contexts | [`note_integration_events.rs`](src/shared_kernel/application/src/integration_events/note_integration_events.rs) |
| Command | a request that something happen; one handler; may be refused | `ShareNote` in [`share_note.rs`](src/contexts/notes/application/src/commands/share_note.rs) |
| Query | a question; answered from a read model; changes nothing | [`get_note.rs`](src/contexts/notes/application/src/queries/get_note.rs) |
| Read model | a shape built for reading, not an aggregate | [`note_queries.rs`](src/contexts/notes/domain/src/note/ports/note_queries.rs) |
| Projection | a read model fed by events |  |
| Port | an interface the domain or the application declares in its own words, for something outside | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs), [`account_directory.rs`](src/contexts/notes/domain/src/note/ports/account_directory.rs) |
| Adapter | the implementation of a port, in the infrastructure | [`repositories.rs`](src/contexts/notes/infrastructure/src/repositories.rs), [`suggestions.rs`](src/contexts/notes/infrastructure/src/suggestions.rs) |
| Repository | the port that loads and saves one aggregate by identity | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs) |
| Domain service | a business rule that spans several aggregates or needs a port | [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) |
| Application service | orchestration shared by several entry points; no rule of its own |  |
| Anti-corruption layer | the handler that translates a foreign contract into local terms |  |
| Snapshot | the plain shape of an aggregate that crosses to the infrastructure | [`dtos.rs`](src/contexts/notes/domain/src/note/dtos.rs) |
| Operation | the handle a client gets for a command: its status and outcome. The Tracker records one for every message on the bus, events included, so a trace shows what a command set off | [`operation.rs`](src/architecture/application/src/operation.rs) |
| Composition root | the one file that knows every context and builds the application |  |
<!-- end generated -->

## Known gaps

- **The Presentation layer and the composition root are not written.** The HTTP transport (axum) and the bootstrap that builds the bus, the unit of work over the stores, the context and the modules are the next increment; the handlers and the wiring are ready for it, and `cargo run -p conventions` already requires the `wiring` crate a context with an Application layer must have.
- **The bus awaits the handlers inline**, so a command is handled before `publish` answers. The transport that answers `202 { operationId }` before the handling is done spawns the publication on its runtime; the bus does not know the runtime, and no crate below the Presentation depends on one (ADR 13).
- **The in-memory unit of work takes the stores it guards as a list**, which the composition root builds; there is no registry of every store of the process as in TypeScript. Its honest limit is the same: a transaction boundary, not isolation.
- **Three contexts of the reference are not here** (Security, Notifications, Tracker): the binding declares the one that is, and the wiring takes the account directory as a parameter, where Security's adapter will go.
