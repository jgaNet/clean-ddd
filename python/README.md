# Clean Architecture & DDD, the Python implementation

The Python rendering of the [reference](../README.md): the same application, the same architecture ([`conventions/`](../conventions/README.md)), the same decisions ([`docs/adr`](../docs/adr)), under the same rules and the same ids. This page is about this directory, and every command on it runs from here.

**What is here today**: the Domain, Application and Infrastructure layers of the Notes context, on the building blocks of each — the `Note` aggregate with everything around it; the six commands and their handlers, the three queries, the two reactions, the port for the one decision the domain cannot make from its own state; the in-memory repository and queries over one store, held to the ports by a contract test; the wiring that lists it all as data — the shared kernel's Domain and Application (the roles, the e-mail, the signed-in guard, the published contract of Notes), and the tool that holds this language to the contract: an import linter and a conventions check in one, generated from the dependency table. The Presentation layer (FastAPI), the composition root and the other three contexts are the next increments; the [map in the root README](../README.md#the-map-concept--language) shows each concept this language still owes as a dash, and nothing on this page claims otherwise.

- [Where the decisions land in Python](#where-the-decisions-land-in-python)
- [The map: concept → file](#the-map-concept--file)
- [The rules, and how they are enforced](#the-rules-and-how-they-are-enforced)
- [Layout](#layout)
- [Running it](#running-it)
- [Vocabulary](#vocabulary) · [Known gaps](#known-gaps)

## Where the decisions land in Python

The decisions are the architecture's, so they hold here; the idiom changes how some of them read, and [ADR 15](../docs/adr/0015-in-python-a-layer-is-a-package-and-an-ast-walk-holds-the-table.md) records the choices below.

- **A refusal is a value, never thrown** ([ADR 1](../docs/adr/0001-result-instead-of-exceptions.md)): [`Result[T]`](src/architecture/domain/result.py) is `Success[T] | Failure`, two frozen dataclasses, narrowed by `isinstance(result, Failure)` — which is what TypeScript wrote as `if (r.isFailure()) return r;`. The exception it carries is a [`DomainException`](src/architecture/domain/exception.py), a value that does not extend `BaseException`; the name says so, since `Exception` is Python's own, the one that *is* raised. A `raise` is for a programming error and corrupted state only.
- **Reconstitution throws on corrupted data** ([ADR 4](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md)): `Note.from_snapshot` raises a `ValueError`, with the note's id in the message.
- **Layers are packages, and the dependency table is held by an `ast` walk.** A tree is a top-level package under `src/` (`architecture`, `shared_kernel`, `contexts`, `bootstrap`), a layer a sub-package named after the contract's layer in lowercase, and a module is imported by its absolute path. Nothing in the language refuses an import, so [`tools/conventions.py`](tools/conventions.py) reads every import of every module with `ast` — never executing it — and holds it to its row of the table, naming the rule it breaks; it is the linter and the check in one, and `tools/test_conventions.py` tries it against the violations it must refuse.
- **Inheritance, where it is the idiom.** An aggregate *extends* [`AggregateRoot`](src/architecture/domain/aggregate_root.py), as in TypeScript; its state stays in private attributes behind properties, and `_record()` is the aggregate's own by convention. A value object is a frozen dataclass over `value`, and the dataclass gives it its equality — by kind and by value. An event is a frozen dataclass whose fields are its payload and whose name is its class, so a test asserting an event asserts what it says.
- **Ports are `Protocol`s with `async` methods** ([`note_repository.py`](src/contexts/notes/domain/note/ports/note_repository.py)), so an adapter may be an in-memory store or a database behind the same interface, and a test hands a domain service a five-line class. Strict `mypy` is the type check the contract's `types` enforcement word stands for.
- **Publishing schedules a task; the dispatch is awaited** ([ADR 14](../docs/adr/0014-in-rust-the-transport-spawns-the-dispatch-and-finds-handlers-by-their-message.md), which holds here as it does in Rust): `publish()` builds the operation and schedules its `dispatch()` on the running loop, so a route answers `202 { operationId }` before the handling; the in-memory bus's `settle()` awaits what is in flight, which is what a test calls to see what the handlers did. A handler is found by its class (`module.get_query(GetNoteQueryHandler)`), as in TypeScript: a Python handler is not generic over its adapter, so naming it names nothing of the infrastructure.
- **An event's name is its class name, read by `name_of()`** ([`event.py`](src/architecture/domain/event.py)), from a class or an instance: the channel the bus routes on, with no property that a payload field called `name` would collide with.

## The map: concept → file

One canonical example per concept, rendered from [`conventions/concepts.yaml`](../conventions/concepts.yaml) — the concepts, shared with every language — and [`conventions/python.yaml`](../conventions/python.yaml), this language's binding, which names the file that shows each; CI checks that every file they name exists. The Presentation layer has no files yet.

### Domain layer

<!-- generated from conventions/concepts.yaml (domain); edit the YAML, then run yarn conventions:write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Entity | [`entity.py`](src/architecture/domain/entity.py) | identity, `equals()`; a class with its state in private attributes; no `__eq__`, so two entities compare through `equals()` or their snapshots |
| Aggregate root | [`note.py`](src/contexts/notes/domain/note/note.py) extending [`AggregateRoot`](src/architecture/domain/aggregate_root.py) | behaviours enforce invariants and `record()` events; `_record()` is protected by convention: a behaviour calls it, a handler never does |
| Value object | [`note_title.py`](src/contexts/notes/domain/note/note_title.py), [`email.py`](src/shared_kernel/domain/email.py) | built through `create()` → `Result`; never invalid once you hold one; a frozen dataclass over `value`; [`value_object.py`](src/architecture/domain/value_object.py) names the shape, and the dataclass gives the equality |
| Identity | [`id.py`](src/architecture/domain/id.py) | generated by the domain (`Id.generate()`), not by the database — [ADR 2](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| Factory | `Note.create()` in [`note.py`](src/contexts/notes/domain/note/note.py) | the aggregate is its own factory: a static `create()` that validates, generates the identity and records the creation event; the constructor is private. When creation needs a collaborator (a port), the factory is a domain service. No `Factory` class; the domain-service factory (an account's registration) is not written yet |
| Invariant | `share_with()` in [`note.py`](src/contexts/notes/domain/note/note.py) | a rule that must hold after every change (only the owner, not archived, not twice, not with yourself): checked inside the behaviour, before the state changes and the event is recorded. There is no `validate()` to forget, and no way to reach the state but through the behaviour |
| Creation vs reconstitution | `Note.create()` vs `Note.from_snapshot()` in [`note.py`](src/contexts/notes/domain/note/note.py) | creation records an event; rebuilding from persistence records nothing — [ADR 4](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md); corrupted storage raises a `ValueError`, which is what a throw is here |
| Domain event | [`events.py`](src/contexts/notes/domain/note/events.py) | past tense, minimal payload, internal to the context; a frozen dataclass per fact, named after its class; [`event.py`](src/architecture/domain/event.py) has the three kinds |
| Domain exception | [`note_exceptions.py`](src/contexts/notes/domain/note/note_exceptions.py) | a broken rule in business words, carried by `Result.fail()`, never thrown — [ADR 1](../docs/adr/0001-result-instead-of-exceptions.md); a [`DomainException`](src/architecture/domain/exception.py) subclass per rule — a value carried by a `Failure`, never raised; named so because `Exception` is Python's own |
| `Result` | [`result.py`](src/architecture/domain/result.py) | `IResult<T>` is the type you write in signatures; `Success[T] \| Failure`, narrowed by `isinstance(result, Failure)`, which is what TypeScript wrote as `if (r.isFailure()) return r` |
| **Optimistic concurrency** | `AggregateRoot.version` in [`aggregate_root.py`](src/architecture/domain/aggregate_root.py), checked by `save()` in [`repositories.py`](src/contexts/notes/infrastructure/repositories.py) | the aggregate carries the version it was read at and never changes it; the repository stores version + 1 and refuses a stale one with `ConcurrencyConflict`, so of two writers who read the same version only the first wins — [ADR 8](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md); the contract test asserts it for every adapter |
| Repository port | [`note_repository.py`](src/contexts/notes/domain/note/ports/note_repository.py) | load / save an aggregate; nothing else; a `Protocol` with `async` methods, so an adapter may be in-memory or a database |
| Queries port & read models | [`note_queries.py`](src/contexts/notes/domain/note/ports/note_queries.py) | returns view shapes, never aggregates — [ADR 5](../docs/adr/0005-queries-return-read-models-not-aggregates.md) |
| Snapshot DTO | [`dtos.py`](src/contexts/notes/domain/note/dtos.py) | the plain shape that crosses to the infrastructure |
| **Domain service** | [`note_sharing.py`](src/contexts/notes/domain/note/note_sharing.py) | a rule about the whole collection ("one account per email") — needs the port, still pure domain; takes its port in `__init__`, so a test hands it a five-line class |
| **Port to another context** (read side) | [`account_directory.py`](src/contexts/notes/domain/note/ports/account_directory.py), used by [`note_sharing.py`](src/contexts/notes/domain/note/note_sharing.py) | Notes asks "does this account exist?" in its own words; only its infrastructure knows Security is next door. The read-side counterpart of the anti-corruption layer for events; the adapter over Security's read model comes with the Security context; the wiring takes the directory as a parameter |
| Lifecycle as an enum | [`note_status.py`](src/contexts/notes/domain/note/note_status.py) | the transitions live in the aggregate, not in the enum |
<!-- end generated -->

### Application layer

<!-- generated from conventions/concepts.yaml (application); edit the YAML, then run yarn conventions:write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Command | `ShareNoteCommandEvent` in [`share_note.py`](src/contexts/notes/application/commands/share_note.py) | a named payload, nothing more. It extends `CommandEvent`, one of the three kinds of message the building blocks define: a command travels on the same bus as the events and is tracked as an operation, so it has their shape; the class says its intent (one handler, may be refused); a frozen dataclass extending `CommandEvent`, its fields the payload; its handler is in the same file, and the channel is the class name (`name_of()`) |
| Command handler | `EditNoteCommandHandler` in [`edit_note.py`](src/contexts/notes/application/commands/edit_note.py) | the shape every "change an existing thing" use case follows; takes its ports in `__init__`; `execute()` returns a `Result` and returns a `Failure` as is |
| Guard (authorization) | `require_signed_in()` in [`guards.py`](src/shared_kernel/application/guards.py), called once at the top of `execute()` | *who may call* is answered here; *what they may do to which object* is the aggregate's business; the `guard()` override for an administrators-only command comes with the Security context |
| Base handler (guard, transaction, safety net) | [`command_handler.py`](src/architecture/application/command_handler.py) | a concrete handler only writes `execute()`; `handle()` is the template method, `run()` its typed half for a command run synchronously; a concrete handler writes `execute()` |
| Query handler | [`get_note.py`](src/contexts/notes/application/queries/get_note.py) | reads through the queries port; a refused query is a failed `Result`, not a throw; `QueryHandler[Q, P, R]`: the queries port, the parameters, the read model; the module finds it by its class |
| Execution context | [`execution_context.py`](src/architecture/application/execution_context.py) | who is calling, with which logger, bus and unit of work; `withTransaction`, `afterCommit`; `with_transaction()` takes a coroutine function, `after_commit()` a plain callable |
| Publish after commit | `publish_domain_events()` in [`domain_events.py`](src/architecture/application/domain_events.py) | [ADR 3](../docs/adr/0003-publish-domain-events-after-commit.md); the handler hands the aggregate over, and the events are pulled at the commit |
| Domain event handler | [`note_shared_handler.py`](src/contexts/notes/application/events/note_shared_handler.py) | where a fact leaves its context |
| Integration event (published contract) | [`note_integration_events.py`](src/shared_kernel/application/integration_events/note_integration_events.py) | the only thing one context may know about another — [ADR 6](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md) |
| **Non-determinism as a value** (ADR 7) | [`suggestions.py`](src/contexts/notes/application/suggestions.py) → [`suggest_note_title.py`](src/contexts/notes/application/commands/suggest_note_title.py), answered locally by [`infrastructure/suggestions.py`](src/contexts/notes/infrastructure/suggestions.py) | a decision the domain cannot make from its own state (a model, a heuristic, a person) enters it as a value the aggregate validates and may refuse; the provenance travels with it and ends on the operation — [ADR 7](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md) |
| Module (wiring) | [`module.py`](src/architecture/application/module.py), used in [`module_local.py`](src/contexts/notes/module_local.py) | plain data: which handler answers which command, query, event; a `Subscription` per command and per reaction, on the event's class; the directory another context answers comes in as a parameter |
<!-- end generated -->

### Infrastructure layer

<!-- generated from conventions/concepts.yaml (infrastructure); edit the YAML, then run yarn conventions:write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Repository implementation | [`repositories.py`](src/contexts/notes/infrastructure/repositories.py) | snapshot in, snapshot out |
| Queries implementation | [`queries.py`](src/contexts/notes/infrastructure/queries.py) | builds read models from the same store, here |
| Event bus | [`event_bus.py`](src/architecture/infrastructure/event_bus.py) | the only bus implementation; `publish()` schedules the dispatch as a task on the running loop and answers at once; `settle()` awaits what is in flight; the port is [`event_bus.py`](src/architecture/application/event_bus.py) |
| Unit of work | [`unit_of_work.py`](src/architecture/infrastructure/unit_of_work.py) | over the stores the composition root lists, or every store of the process |
| The "database" | [`data_sources.py`](src/architecture/infrastructure/data_sources.py) | a `Map`; the ports are what a real adapter would implement; a dict, which keeps insertion order |
<!-- end generated -->

### Presentation and bootstrap

<!-- generated from conventions/concepts.yaml (presentation); edit the YAML, then run yarn conventions:write -->
<!-- end generated -->

### Tests, one style per layer

<!-- generated from conventions/concepts.yaml (tests); edit the YAML, then run yarn conventions:write -->
| Layer | Example | Doubles |
| --- | --- | --- |
| Domain | [`test_note.py`](src/contexts/notes/domain/note/test_note.py) | none |
| Domain service | [`test_note_sharing.py`](src/contexts/notes/domain/note/test_note_sharing.py) | a five-line class implementing the port |
| Application | [`test_commands.py`](src/contexts/notes/application/commands/test_commands.py), [`test_get_note.py`](src/contexts/notes/application/queries/test_get_note.py) | the in-memory repository *is* the double; a recording bus of ten lines says what was published |
| **Contract** (one port, every adapter) | [`test_persistence_contract.py`](src/contexts/notes/infrastructure/test_persistence_contract.py) | none — every case runs over each entry of `adapters`, same expectations; a second adapter is one more entry |
<!-- end generated -->

## The rules, and how they are enforced

The rules are the contract's, listed with their ids in the root [CLAUDE.md](../CLAUDE.md); what stands behind each enforcement word here is in the binding's `enforcers`: `linter` and `check` are both `uv run python -m tools.conventions`, `types` is strict `mypy`, `tests` is `pytest`.

<!-- generated from conventions/architecture.yaml (rules); edit the YAML, then run yarn conventions:write -->
| Rule | Enforced by |
| --- | --- |
| **ARCH-RELATIVE** — A relative import names a sibling file and nothing else; anything across directories goes through the path the import rules are written against. | `uv run python -m tools.conventions`, an `ast` walk holding every import of every module to its row of the table · [conventions.py](tools/conventions.py) |
| **ARCH-INWARD** — Dependencies point inward and contexts stay apart — each file imports only what its row of the dependency table allows; there is no exception and none may be added. | `uv run python -m tools.conventions`, an `ast` walk holding every import of every module to its row of the table · [architecture.yaml](../conventions/architecture.yaml), [README.md](../conventions/README.md), [conventions.py](tools/conventions.py), [__init__.py](src/contexts/notes/domain/__init__.py) |
| **ARCH-TREES** — The building blocks import nothing outside themselves, not even the shared kernel; the shared kernel imports the building blocks and no context. | `uv run python -m tools.conventions`, an `ast` walk holding every import of every module to its row of the table · [architecture](src/architecture), [shared_kernel](src/shared_kernel) |
| **ARCH-CONTEXT-DECLARED** — Every directory under the contexts tree is a context declared in the language's binding, holds only the declared layers and its wiring file. | `uv run python -m tools.conventions` · [README.md](../conventions/README.md) |
| **ARCH-MODULES-DATA** — A context's wiring is one file building a Module as data — its name, its commands, its queries, its domain event and integration event handlers; anything else it exposes is a named export of that file. No container, no builder, no service locator. | review (stated here, not yet mechanical) · [module_local.py](src/contexts/notes/module_local.py), [module.py](src/architecture/application/module.py) |
| **ARCH-EXECUTION-CONTEXT** — ExecutionContext carries what exists per request and nothing else — who is calling, the trace, the transaction, the bus, the logger. A mailer, a clock, a model client is a constructor dependency of the handler that needs it. | review (stated here, not yet mechanical) · [execution_context.py](src/architecture/application/execution_context.py) |
| **DOMAIN-RESULT** — A refused command or query is a failed Result value, never a thrown exception; throwing (or panicking) is for programming errors and corrupted state only. | `uv run pytest` · [0001-result-instead-of-exceptions.md](../docs/adr/0001-result-instead-of-exceptions.md), [result.py](src/architecture/domain/result.py) |
| **DOMAIN-RECORDS-EVENTS** — Only an aggregate root records domain events (`record(...)` inside a behaviour); handlers never construct one, they call `publishDomainEvents(aggregate, context)` after saving. | `uv run mypy` (strict) · [aggregate_root.py](src/architecture/domain/aggregate_root.py), [domain_events.py](src/architecture/application/domain_events.py) |
| **DOMAIN-CREATE-VS-RECONSTITUTE** — `create()` / `register()` validates and records a creation event; `fromSnapshot()` records nothing and throws on corrupted data. | `uv run pytest` · [0004-reconstitution-throws-on-corrupted-data.md](../docs/adr/0004-reconstitution-throws-on-corrupted-data.md), [note.py](src/contexts/notes/domain/note/note.py) |
| **DOMAIN-IDENTITY** — An aggregate generates its own identity (`Id.generate()` in `create()`). A repository loads and saves aggregates, and answers the facts a domain rule needs about the collection (`findByEmail`, `countByOwner`); it never hands out identities and never searches for a screen. | review (stated here, not yet mechanical) · [0002-identity-is-generated-by-the-domain.md](../docs/adr/0002-identity-is-generated-by-the-domain.md) |
| **DOMAIN-NON-DETERMINISM** — Time is a parameter with a default; identity is generated by the domain; anything else that is not a function of the business state (randomness, a model, a person, another system) lives behind a port named for what it decides, and its result is a plain value the aggregate validates and may refuse. | review (stated here, not yet mechanical) · [0007-non-determinism-enters-the-domain-as-a-value.md](../docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md), [suggestions.py](src/contexts/notes/application/suggestions.py), [suggest_note_title.py](src/contexts/notes/application/commands/suggest_note_title.py) |
| **EVENT-AFTER-COMMIT** — Domain events are published after the transaction commits, never before; a rolled-back transaction publishes nothing and leaves the events on the aggregate. | `uv run pytest` · [0003-publish-domain-events-after-commit.md](../docs/adr/0003-publish-domain-events-after-commit.md), [execution_context.py](src/architecture/application/execution_context.py), [domain_events.py](src/architecture/application/domain_events.py) |
| **QUERY-READ-MODELS** — Queries return read models, repositories return aggregates; never the other way. | `uv run mypy` (strict) · [0005-queries-return-read-models-not-aggregates.md](../docs/adr/0005-queries-return-read-models-not-aggregates.md), [note_queries.py](src/contexts/notes/domain/note/ports/note_queries.py), [queries.py](src/contexts/notes/infrastructure/queries.py) |
| **CTX-CONTRACTS** — Contexts talk in two ways only — integration events published in the shared kernel, and ports the asking side owns, answered by an adapter over the other context's read model; a context's Domain never imports another context. | `uv run python -m tools.conventions`, an `ast` walk holding every import of every module to its row of the table · [0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md](../docs/adr/0006-integration-events-and-owned-ports-are-the-contracts-between-contexts.md) |
| **CONC-OPTIMISTIC** — An aggregate carries the version it was read at and never changes it; `save()` stores version + 1 and refuses an aggregate that is no longer at the stored version with a ConcurrencyConflictException. | `uv run pytest` · [0008-optimistic-concurrency-on-the-aggregate.md](../docs/adr/0008-optimistic-concurrency-on-the-aggregate.md), [repositories.py](src/contexts/notes/infrastructure/repositories.py), [test_persistence_contract.py](src/contexts/notes/infrastructure/test_persistence_contract.py) |
| **ARCH-MAP-IS-REAL** — Every file the concept map names exists, every documentation link resolves, nothing silences the linter, and the generated import rules refuse and allow what the probes say. | `uv run python -m tools.conventions` · [concepts.yaml](../conventions/concepts.yaml), [conventions.py](tools/conventions.py) |
| **ARCH-LEARNABLE** — A newcomer, or an agent, can add a feature in the right shape from the documentation alone. | fresh-agent evaluations · [README.md](../docs/evaluations/README.md) |
| **ARCH-ONE-CONTRACT** — Every language the reference is written in is held to this file — the same layers, the same rules under the same ids, the same HTTP grammar — through a binding that says where its trees are and which file shows each concept; a language never carries a rule of its own. | `uv run python -m tools.conventions` · [0011-one-reference-several-languages.md](../docs/adr/0011-one-reference-several-languages.md), [README.md](../conventions/README.md) |
<!-- end generated -->

### Who may import whom

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
pyproject.toml                    the project (uv): the dependencies, ruff, mypy (strict), pytest
src/architecture/
  domain/                         the building blocks' Domain: Entity, AggregateRoot, ValueObject, Id, the three kinds
                                  of Event, DomainException, Result (Success | Failure) — depends on nothing
  application/                    CommandHandler, QueryHandler, EventHandler, ExecutionContext, Operation, the EventBus
                                  port, Module, publish_domain_events()
  infrastructure/                 InMemoryDataSource, InMemoryEventBus, InMemoryUnitOfWork, ConsoleLogger
src/shared_kernel/
  domain/                         Email, Role
  application/                    guards.py (require_signed_in), integration_events/ (the published contracts)
src/contexts/notes/
  domain/note/
    note.py                       the aggregate                 note_title.py           value object
    note_status.py                lifecycle                     events.py               domain events
    note_exceptions.py            broken rules, in business words
    dtos.py                       the snapshot shape            note_sharing.py         domain service
    ports/                        note_repository (write), note_queries (read models), account_directory (another context)
  application/
    commands/<use_case>.py        the command and its handler, one file each; test_commands.py beside them
    queries/<use_case>.py         one query handler each
    events/<fact>_handler.py      the reactions: NoteCreated (a log line), NoteShared (an integration event)
    suggestions.py                the port for a title suggestion (ADR 7)
  infrastructure/
    repositories.py queries.py    the in-memory adapters over one store      suggestions.py   the first-line heuristic
    test_persistence_contract.py  one port, every adapter
  module_local.py                 the wiring: the store, the adapters, the handlers listed in a Module
  test_*.py                       everywhere: the tests, beside what they test
tools/conventions.py              uv run python -m tools.conventions: every import is the table, the tree is the contract's
tools/test_conventions.py         the check tried against the violations it must refuse
```

A context's Presentation layer to come is a package beside the others; the composition root goes in `src/bootstrap`.

## Running it

Requires Python ≥ 3.13 and [uv](https://docs.astral.sh/uv/). Everything runs from this directory; `uv sync` once installs the toolchain into `.venv/`.

```bash
cd python
uv sync                                     # the toolchain, from uv.lock
uv run python -m tools.conventions          # every import is the table, the tree matches the binding, every named file exists
uv run ruff format --check .                # the formatter, as CI runs it (ruff format . to apply)
uv run ruff check .                         # the lints
uv run mypy                                 # strict typing, src/ and tools/
uv run pytest                               # every test_*.py
```

There is no server to start yet: `uv run pytest` is the way to see the use cases run, through the handlers and the in-memory adapters. The documents of this directory are rendered from the contract by the TypeScript tooling, which reads every binding: after editing `conventions/python.yaml`, run `yarn --cwd ../typescript conventions:write`.

## Vocabulary

The words the reference uses, with the file that shows them here; a word with no file yet is one this language still owes.

<!-- generated from conventions/concepts.yaml (vocabulary); edit the YAML, then run yarn conventions:write -->
| Word | Here it means | See |
| --- | --- | --- |
| Building blocks | the mechanics every context is written with (Entity, AggregateRoot, ValueObject, Result, the handlers, the bus); they know no context and no vocabulary, not even the roles | [`src/architecture`](src/architecture) |
| Shared kernel | the part of the domain model every context agrees on — Email, Role, who counts as signed in, and the integration events; not the base classes, which is what the word is often misused for | [`src/shared_kernel`](src/shared_kernel) |
| Bounded context | a folder with its own vocabulary and wiring, talking to others through integration events only | [`src/contexts`](src/contexts) |
| Aggregate (root) | the object that owns a consistency boundary: every change goes through one of its behaviours, which checks the invariants and records an event | [`note.py`](src/contexts/notes/domain/note/note.py) |
| Entity | an object with an identity that outlives its attributes | [`entity.py`](src/architecture/domain/entity.py) |
| Value object | an object without identity, compared by value, valid from the moment it exists | [`note_title.py`](src/contexts/notes/domain/note/note_title.py) |
| Invariant | a rule that must hold after every change of an aggregate | `share_with()` in [`note.py`](src/contexts/notes/domain/note/note.py) |
| Domain event | a fact, in the past tense, recorded by an aggregate for the rest of the system | [`events.py`](src/contexts/notes/domain/note/events.py) |
| Integration event | a fact restated as a published contract for other contexts | [`note_integration_events.py`](src/shared_kernel/application/integration_events/note_integration_events.py) |
| Command | a request that something happen; one handler; may be refused | `ShareNoteCommandEvent` in [`share_note.py`](src/contexts/notes/application/commands/share_note.py) |
| Query | a question; answered from a read model; changes nothing | [`get_note.py`](src/contexts/notes/application/queries/get_note.py) |
| Read model | a shape built for reading, not an aggregate | [`note_queries.py`](src/contexts/notes/domain/note/ports/note_queries.py) |
| Projection | a read model fed by events |  |
| Port | an interface the domain or the application declares in its own words, for something outside | [`note_repository.py`](src/contexts/notes/domain/note/ports/note_repository.py), [`account_directory.py`](src/contexts/notes/domain/note/ports/account_directory.py) |
| Adapter | the implementation of a port, in the infrastructure | [`repositories.py`](src/contexts/notes/infrastructure/repositories.py), [`suggestions.py`](src/contexts/notes/infrastructure/suggestions.py) |
| Repository | the port that loads and saves one aggregate by identity | [`note_repository.py`](src/contexts/notes/domain/note/ports/note_repository.py) |
| Domain service | a business rule that spans several aggregates or needs a port | [`note_sharing.py`](src/contexts/notes/domain/note/note_sharing.py) |
| Application service | orchestration shared by several entry points; no rule of its own |  |
| Anti-corruption layer | the handler that translates a foreign contract into local terms |  |
| Snapshot | the plain shape of an aggregate that crosses to the infrastructure | [`dtos.py`](src/contexts/notes/domain/note/dtos.py) |
| Operation | the handle a client gets for a command: its status and outcome. The Tracker records one for every message on the bus, events included, so a trace shows what a command set off | [`operation.py`](src/architecture/application/operation.py) |
| Composition root | the one file that knows every context and builds the application |  |
<!-- end generated -->

## Known gaps

- **No Presentation and no composition root yet.** The routes (FastAPI), the authentication layer, the presenters and the bootstrap are the next increments, in the order the Rust implementation took. Until then the wiring is a function the composition root will call, with the account directory Security answers as a parameter.
- **One adapter per port.** The SQLite pair comes with the front end; the contract test is written against the ports, with one entry in `adapters`, so a second adapter is one more entry.
- **The boundary is held by a tool, not by the language.** Python has no compiler to refuse an import and no linter that reads the table; `tools/conventions.py` is both, and a test module (`test_*.py`) gets its layer's `specs` row the way the ESLint overrides give it to a `.spec.ts`. A refusal names its rule; what it cannot see is an import done at run time (`importlib`), which this reference never does.
- **Three contexts of the reference are not here** (Security, Notifications, Tracker): the binding declares the one that is.
