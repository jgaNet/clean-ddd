# Clean Architecture & DDD, the Rust implementation

The Rust rendering of the [reference](../README.md): the same application, the same architecture ([`conventions/`](../conventions/README.md)), the same decisions ([`docs/adr`](../docs/adr)), under the same rules and the same ids. This page is about this directory, and every command on it runs from here.

**What is here today**: the Domain layer of the building blocks, the Domain of the shared kernel, and the Domain of the Notes context — the aggregate, its value objects, its events, its exceptions, its snapshot, its ports and the domain service that asks another context. The Application, Infrastructure and Presentation layers are not written yet; the [map in the root README](../README.md#the-map-concept--language) shows each concept this language still owes as a dash, and nothing on this page claims otherwise.

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
- **Ports are traits whose methods return `impl Future`** ([`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs)), so an adapter may be an in-memory store or a database behind the same interface; a domain service is generic over the port it needs, and a test hands it a five-line struct.

## The map: concept → file

One canonical example per concept, rendered from [`conventions/concepts.yaml`](../conventions/concepts.yaml) — the concepts, shared with every language — and [`conventions/rust.yaml`](../conventions/rust.yaml), this language's binding, which names the file that shows each; CI checks that every file they name exists. Only the Domain layer has files so far.

### Domain layer

<!-- generated from conventions/concepts.yaml (domain); edit the YAML, then run yarn conventions:write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Entity | [`entity.rs`](src/architecture/domain/src/entity.rs) | identity, `equals()`; a trait; the kind is the type, so two kinds cannot even be compared |
| Aggregate root | [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) holding an [`AggregateRoot`](src/architecture/domain/src/aggregate_root.rs) | behaviours enforce invariants and `record()` events; no inheritance: the aggregate holds the root in a private field and delegates |
| Value object | [`note_title.rs`](src/contexts/notes/domain/src/note/note_title.rs), [`email.rs`](src/shared_kernel/domain/src/email.rs) | built through `create()` → `Result`; never invalid once you hold one; a newtype with a private field deriving `PartialEq`; [`value_object.rs`](src/architecture/domain/src/value_object.rs) names the shape |
| Identity | [`id.rs`](src/architecture/domain/src/id.rs) | generated by the domain (`Id.generate()`), not by the database — [ADR 2](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| Factory | `Note::create()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | the aggregate is its own factory: a static `create()` that validates, generates the identity and records the creation event; the constructor is private. When creation needs a collaborator (a port), the factory is a domain service. No `Factory` class; the domain-service factory is not written yet |
| Invariant | `share_with()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | a rule that must hold after every change (only the owner, not archived, not twice, not with yourself): checked inside the behaviour, before the state changes and the event is recorded. There is no `validate()` to forget, and no way to reach the state but through the behaviour |
| Creation vs reconstitution | `Note::create()` vs `Note::from_snapshot()` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | creation records an event; rebuilding from persistence records nothing — [ADR 4](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md); corrupted storage panics, which is what a throw is here |
| Domain event | [`events.rs`](src/contexts/notes/domain/src/note/events.rs) | past tense, minimal payload, internal to the context; one enum per aggregate, one variant per fact; [`event.rs`](src/architecture/domain/src/event.rs) has the three kinds as traits |
| Domain exception | [`note_exceptions.rs`](src/contexts/notes/domain/src/note/note_exceptions.rs) | a broken rule in business words, carried by `Result.fail()`, never thrown — [ADR 1](../docs/adr/0001-result-instead-of-exceptions.md); a `kind` constant and a constructor function per rule, building an [`Exception`](src/architecture/domain/src/exception.rs) |
| `Result` | [`result.rs`](src/architecture/domain/src/result.rs) | `IResult<T>` is the type you write in signatures; the language's own `Result<T, Exception>`, and `?` where TypeScript wrote `if (r.isFailure()) return r` |
| **Optimistic concurrency** | `AggregateRoot::version` in [`aggregate_root.rs`](src/architecture/domain/src/aggregate_root.rs) | the aggregate carries the version it was read at and never changes it; the repository stores version + 1 and refuses a stale one with `ConcurrencyConflict`, so of two writers who read the same version only the first wins — [ADR 8](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md); the repository that stores version + 1 is not written yet |
| Repository port | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs) | load / save an aggregate; nothing else; a trait whose methods return `impl Future`, so an adapter may be in-memory or a database |
| Queries port & read models | [`note_queries.rs`](src/contexts/notes/domain/src/note/ports/note_queries.rs) | returns view shapes, never aggregates — [ADR 5](../docs/adr/0005-queries-return-read-models-not-aggregates.md) |
| Snapshot DTO | [`dtos.rs`](src/contexts/notes/domain/src/note/dtos.rs) | the plain shape that crosses to the infrastructure |
| **Domain service** | [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) | a rule about the whole collection ("one account per email") — needs the port, still pure domain; generic over its port, so a test hands it a five-line struct |
| **Port to another context** (read side) | [`account_directory.rs`](src/contexts/notes/domain/src/note/ports/account_directory.rs), used by [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) | Notes asks "does this account exist?" in its own words; only its infrastructure knows Security is next door. The read-side counterpart of the anti-corruption layer for events; the adapter over Security's read model is not written yet |
| Lifecycle as an enum | [`note_status.rs`](src/contexts/notes/domain/src/note/note_status.rs) | the transitions live in the aggregate, not in the enum |
<!-- end generated -->

### Tests, one style per layer

<!-- generated from conventions/concepts.yaml (tests); edit the YAML, then run yarn conventions:write -->
| Layer | Example | Doubles |
| --- | --- | --- |
| Domain | `mod tests` in [`note/mod.rs`](src/contexts/notes/domain/src/note/mod.rs) | none |
| Domain service | `mod tests` in [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) | a five-line struct implementing the port |
<!-- end generated -->

## The rules, and how they are enforced

Every rule has a stable id, a reason, a remediation and says how it is held — in the contract's words (`linter`, `check`, `types`, `tests`, `review`, `evaluations`) and, below, in this language's: the crate graph, `cargo run -p conventions`, the compiler, a `#[test]`, review, the evaluations. The rules are the same in every language; the files that show them are this language's. Ask any of them from `typescript/`: `yarn architecture rule CONC-OPTIMISTIC`.

<!-- generated from conventions/architecture.yaml (rules); edit the YAML, then run yarn conventions:write -->
| Rule | Enforced by |
| --- | --- |
| **ARCH-RELATIVE** — A relative import names a sibling file and nothing else; anything across directories goes through the path the import rules are written against. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [CLAUDE.md](CLAUDE.md) |
| **ARCH-INWARD** — Dependencies point inward and contexts stay apart — each file imports only what its row of the dependency table allows; there is no exception and none may be added. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [architecture.yaml](../conventions/architecture.yaml), [README.md](../conventions/README.md), [Cargo.toml](src/contexts/notes/domain/Cargo.toml) |
| **ARCH-TREES** — The building blocks import nothing outside themselves, not even the shared kernel; the shared kernel imports the building blocks and no context. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [architecture](src/architecture), [shared_kernel](src/shared_kernel) |
| **ARCH-CONTEXT-DECLARED** — Every directory under the contexts tree is a context declared in the language's binding, holds only the declared layers and its wiring file. | `cargo run -p conventions` · [README.md](../conventions/README.md) |
| **ARCH-MODULES-DATA** — A context's wiring is one file building a Module as data — its name, its commands, its queries, its domain event and integration event handlers; anything else it exposes is a named export of that file. No container, no builder, no service locator. | review (stated here, not yet mechanical) |
| **ARCH-EXECUTION-CONTEXT** — ExecutionContext carries what exists per request and nothing else — who is calling, the trace, the transaction, the bus, the logger. A mailer, a clock, a model client is a constructor dependency of the handler that needs it. | review (stated here, not yet mechanical) |
| **DOMAIN-RESULT** — A refused command or query is a failed Result value, never a thrown exception; throwing (or panicking) is for programming errors and corrupted state only. | a `#[test]` · [0001-result-instead-of-exceptions.md](../docs/adr/0001-result-instead-of-exceptions.md), [result.rs](src/architecture/domain/src/result.rs) |
| **DOMAIN-RECORDS-EVENTS** — Only an aggregate root records domain events (`record(...)` inside a behaviour); handlers never construct one, they call `publishDomainEvents(aggregate, context)` after saving. | the compiler · [aggregate_root.rs](src/architecture/domain/src/aggregate_root.rs) |
| **DOMAIN-CREATE-VS-RECONSTITUTE** — `create()` / `register()` validates and records a creation event; `fromSnapshot()` records nothing and throws on corrupted data. | a `#[test]` · [0004-reconstitution-throws-on-corrupted-data.md](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md), [mod.rs](src/contexts/notes/domain/src/note/mod.rs) |
| **DOMAIN-IDENTITY** — An aggregate generates its own identity (`Id.generate()` in `create()`). A repository loads and saves aggregates, and answers the facts a domain rule needs about the collection (`findByEmail`, `countByOwner`); it never hands out identities and never searches for a screen. | review (stated here, not yet mechanical) · [0002-identity-is-generated-by-the-domain.md](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| **DOMAIN-NON-DETERMINISM** — Time is a parameter with a default; identity is generated by the domain; anything else that is not a function of the business state (randomness, a model, a person, another system) lives behind a port named for what it decides, and its result is a plain value the aggregate validates and may refuse. | review (stated here, not yet mechanical) · [0007-non-determinism-enters-the-domain-as-a-value.md](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md) |
| **EVENT-AFTER-COMMIT** — Domain events are published after the transaction commits, never before; a rolled-back transaction publishes nothing and leaves the events on the aggregate. | a `#[test]` · [0003-publish-domain-events-after-commit.md](../docs/adr/0003-publish-domain-events-after-commit.md) |
| **QUERY-READ-MODELS** — Queries return read models, repositories return aggregates; never the other way. | the compiler · [0005-queries-return-read-models-not-aggregates.md](../docs/adr/0005-queries-return-read-models-not-aggregates.md) |
| **CTX-CONTRACTS** — Contexts talk in two ways only — integration events published in the shared kernel, and ports the asking side owns, answered by an adapter over the other context's read model; a context's Domain never imports another context. | the crate graph — each layer is a crate whose `[dependencies]` are its row of the table, held by the compiler and compared to the contract by `cargo run -p conventions` · [0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md) |
| **CONC-OPTIMISTIC** — An aggregate carries the version it was read at and never changes it; `save()` stores version + 1 and refuses an aggregate that is no longer at the stored version with a ConcurrencyConflictException. | a `#[test]` · [0008-optimistic-concurrency-on-the-aggregate.md](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md), [aggregate_root.rs](src/architecture/domain/src/aggregate_root.rs) |
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
src/architecture/domain/          crate architecture-domain: Entity, AggregateRoot, ValueObject, Id, the three
                                  kinds of Event, Exception, DomainResult — depends on nothing
src/shared_kernel/domain/         crate shared-kernel-domain: Email, Role
src/contexts/notes/domain/        crate notes-domain
  src/note/mod.rs                 the aggregate, with its tests
  src/note/note_title.rs          value object            src/note/events.rs            domain events
  src/note/note_status.rs         lifecycle               src/note/note_exceptions.rs   broken rules, in business words
  src/note/dtos.rs                the snapshot shape      src/note/note_sharing.rs      domain service
  src/note/ports/                 note_repository (write), note_queries (read models), account_directory (another context)
tools/conventions/                cargo run -p conventions: the graph is the table, the tree is the contract's
```

A context's layers to come are crates beside `domain/` (`application/`, `infrastructure/`, `presentation/`) and a `wiring/` crate, each with its row of the table as `[dependencies]`.

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
| Integration event | a fact restated as a published contract for other contexts |  |
| Command | a request that something happen; one handler; may be refused |  |
| Query | a question; answered from a read model; changes nothing |  |
| Read model | a shape built for reading, not an aggregate | [`note_queries.rs`](src/contexts/notes/domain/src/note/ports/note_queries.rs) |
| Projection | a read model fed by events |  |
| Port | an interface the domain or the application declares in its own words, for something outside | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs), [`account_directory.rs`](src/contexts/notes/domain/src/note/ports/account_directory.rs) |
| Adapter | the implementation of a port, in the infrastructure |  |
| Repository | the port that loads and saves one aggregate by identity | [`note_repository.rs`](src/contexts/notes/domain/src/note/ports/note_repository.rs) |
| Domain service | a business rule that spans several aggregates or needs a port | [`note_sharing.rs`](src/contexts/notes/domain/src/note/note_sharing.rs) |
| Application service | orchestration shared by several entry points; no rule of its own |  |
| Anti-corruption layer | the handler that translates a foreign contract into local terms |  |
| Snapshot | the plain shape of an aggregate that crosses to the infrastructure | [`dtos.rs`](src/contexts/notes/domain/src/note/dtos.rs) |
| Operation | the handle a client gets for a command: its status and outcome. The Tracker records one for every message on the bus, events included, so a trace shows what a command set off |  |
| Composition root | the one file that knows every context and builds the application |  |
<!-- end generated -->

## Known gaps

- **Three layers and the composition root are not written.** The Application layer (handlers, execution context, event bus, module), the Infrastructure (in-memory and SQLite adapters, the unit of work) and the Presentation (axum) are the next increments, each a crate with its row of the table; the map says which concepts they will bring.
- **The ports are `async` by shape and there is no runtime yet**: the domain tests drive them with `pollster`. The runtime arrives with the Presentation layer, and the ports will not change.
- **Three contexts of the reference are not here** (Security, Notifications, Tracker): the binding declares the one that is.
