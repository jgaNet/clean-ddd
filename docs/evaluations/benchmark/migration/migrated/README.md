# linkbox

An application built on the Clean Architecture and Domain-Driven Design reference implementation
[clean-ddd](https://github.com/jgaNet/clean-ddd), in TypeScript: its building blocks, its shared kernel, its
architecture contract and its checks, with none of its business.

## What is here

```
src/Architecture/     the building blocks: Entity, AggregateRoot, ValueObject, Result, the handlers,
                      the execution context, the event bus, the in-memory adapters. Mechanics, no vocabulary.
src/SharedKernel/     what every context will agree on: the shared kernel's model (an email, a role, the
                      signed-in guard) and, under src/SharedKernel/Application/IntegrationEvents/, the integration events your contexts will publish.
src/Contexts/         your bounded contexts: Tracker to start with, and yours beside it.
src/Bootstrap/        the composition root: the transport, the bus, the modules and their routes.
conventions/          the architecture as data; the import rules are generated from it.
                      The tooling that holds the code to it is the clean-ddd package (yarn architecture …, yarn check:conventions).
```

## First steps

```bash
yarn install                          # the language's toolchain
yarn check:conventions                # the contract is sound, the documents are rendered from it
yarn check:conventions                # the tree and the imports, by the language's own tool
yarn format:check                     # as CI runs it
yarn lint                             # as CI runs it
yarn typecheck                        # as CI runs it
yarn test:units                       # as CI runs it
yarn test:e2e                         # as CI runs it
yarn architecture inspect             # what the contract holds
yarn architecture checklist context   # what your first context is made of
```

Then: name your first context in `conventions/typescript.yaml` and describe it in `conventions/domain.yaml`,
create it under `src/Contexts`, and register its module and its routes in the composition root under
`src/Bootstrap`, as the ones already there are. `yarn architecture checklist aggregate` says
what goes in its Domain, and `yarn architecture can-import <file> <specifier>` or the language's own `can-import` answers,
before you write an import, whether the rules allow it.

## The rules, and how they are enforced

Every rule has a stable id; `yarn architecture rule <ID>` explains it, `--json` for a tool.

<!-- generated from conventions/architecture.yaml (rules); edit the YAML, then run the conventions check with --write -->
| Rule | Enforced by |
| --- | --- |
| **ARCH-RELATIVE** — A relative import names a sibling file and nothing else; anything across directories goes through the path the import rules are written against. | ESLint, generated from `architecture.yaml` |
| **ARCH-INWARD** — Dependencies point inward and contexts stay apart — each file imports only what its row of the dependency table allows; there is no exception and none may be added. | ESLint, generated from `architecture.yaml` |
| **ARCH-TREES** — The building blocks import nothing outside themselves, not even the shared kernel; the shared kernel imports the building blocks and no context. | ESLint, generated from `architecture.yaml` · [Architecture](src/Architecture), [SharedKernel](src/SharedKernel) |
| **ARCH-CONTEXT-DECLARED** — Every directory under the contexts tree is a context declared in the language's binding, holds only the declared layers and its wiring file. | `yarn check:conventions` |
| **ARCH-MODULES-DATA** — A context's wiring is one file building a Module as data — its name, its commands, its queries, its domain event and integration event handlers; anything else it exposes is a named export of that file. No container, no builder, no service locator. | review (stated here, not yet mechanical) |
| **ARCH-ONE-HANDLER** — A command has exactly one handler — the Module lists it once, with one handler, and every command a route or a policy builds is one the Module lists; a fact may have any number of subscribers. | `yarn check:conventions` |
| **ARCH-EXECUTION-CONTEXT** — ExecutionContext carries what exists per request and nothing else — who is calling, the trace, the transaction, the bus, the logger. A mailer, a clock, a model client is a constructor dependency of the handler that needs it. | review (stated here, not yet mechanical) · [ExecutionContext.ts](src/Architecture/Application/ExecutionContext.ts) |
| **DOMAIN-RESULT** — A refused command or query is a failed Result value, never a thrown exception; throwing (or panicking) is for programming errors and corrupted state only. | a spec · [CommandHandler.spec.ts](src/Architecture/Application/CommandHandler.spec.ts) |
| **DOMAIN-RECORDS-EVENTS** — Only an aggregate root records domain events (`record(...)` inside a behaviour); handlers never construct one, they call `publishDomainEvents(aggregate, context)` after saving. | the type checker · [AggregateRoot.ts](src/Architecture/Domain/AggregateRoot.ts) |
| **DOMAIN-CREATE-VS-RECONSTITUTE** — `create()` / `register()` validates and records a creation event; `fromSnapshot()` records nothing and throws on corrupted data. | a spec |
| **DOMAIN-IDENTITY** — An aggregate generates its own identity (`Id.generate()` in `create()`). A repository loads and saves aggregates, and answers the facts a domain rule needs about the collection (`findByEmail`, `countByOwner`); it never hands out identities and never searches for a screen. Identity is born once — a thing first made in one context and taken up by another keeps the id it was born with; the integration event that announces it carries that id, and the receiving side builds its object on it instead of generating a new one, so the id a client was answered finds the thing in every context. | review (stated here, not yet mechanical) |
| **DOMAIN-NON-DETERMINISM** — Time is a parameter with a default; identity is generated by the domain; anything else that is not a function of the business state (randomness, a model, a person, another system) lives behind a port named for what it decides, and its result is a plain value the aggregate validates and may refuse. | review (stated here, not yet mechanical) |
| **EVENT-AFTER-COMMIT** — Domain events are made durable with the state they describe, in the same transaction (the outbox), and published from there after the commit — never before, and never from memory alone; a rolled-back transaction stores nothing and leaves the events on the aggregate; a fact a crash kept from being published is published on the next relay, so a subscriber may see a fact twice and the bus delivers a message it already delivered once only; a reaction runs in a transaction of its own, and what it saves and what it publishes are made durable and published the same way. | a spec · [DomainEvents.spec.ts](src/Architecture/Application/DomainEvents.spec.ts), [InMemoryEventBus.spec.ts](src/Architecture/Infrastructure/EventBus/InMemoryEventBus.spec.ts) |
| **QUERY-READ-MODELS** — Queries return read models, repositories return aggregates; never the other way. | the type checker |
| **CTX-CONTRACTS** — Contexts talk in two ways only — integration events published in the shared kernel, and ports the asking side owns, answered by an adapter over the other context's read model; a context's Domain never imports another context. | ESLint, generated from `architecture.yaml` |
| **CONC-OPTIMISTIC** — An aggregate carries the version it was read at and never changes it; `save()` stores version + 1 and refuses an aggregate that is no longer at the stored version with a ConcurrencyConflictException; the command handler then re-reads and re-decides in a new transaction, up to three attempts, and the third conflict is the operation's refusal. | a spec · [CommandHandler.spec.ts](src/Architecture/Application/CommandHandler.spec.ts) |
| **ARCH-MAP-IS-REAL** — Every file the concept map names exists, every documentation link resolves, nothing silences the linter, and the generated import rules refuse and allow what the probes say. | `yarn check:conventions` |
| **ARCH-LEARNABLE** — A newcomer, or an agent, can add a feature in the right shape from the documentation alone. | fresh-agent evaluations |
| **ARCH-ONE-CONTRACT** — Every language the reference is written in is held to this file — the same layers, the same rules under the same ids, the same HTTP grammar — through a binding that says where its trees are and which file shows each concept; a language never carries a rule of its own. | `yarn check:conventions` |
| **API-ONE-SURFACE** — Every language answers the same HTTP API — the same routes, status codes, body shapes and public names — so one black-box scenario, run against each server, passes unchanged; the public name of an operation is its intent or its fact without the suffix of its kind (`ShareNote`, `NoteShared`). | a spec · [OperationProjection.ts](src/Contexts/Tracker/Application/Projections/OperationProjection.ts) |
| **API-BODY-SHAPE** — A command's request body is refused by the transport for its shape only — a field missing or of the wrong type answers 400; whether a value is allowed (one of a list, a format, a length, a range, a count) is the domain's to decide, and its refusal is the operation's ERROR behind the 202, named by the rule's exception. | a spec · [eslint.config.js](eslint.config.js) |
| **CTX-MAP-DECLARED** — Every relationship between two contexts is declared once in the context map, with the strategic pattern it follows, the mechanism that carries it and why; the contracts it carries are read from the code, and the check refuses a link in the code the map does not declare and a declared relationship nothing in the code carries, unless it is declared `planned` — decided before the code that carries it. | `yarn check:conventions` |
| **ARCH-ONE-APPLICATION** — Every language's tree says the same application, in words every language shares — the commands of each context with who may call them, their route, the aggregate they reach and the events it records; the queries; the domain events; the policies and what they publish or reach; the links between contexts; each language's tool writes that inventory from its own tree, and the check holds the inventories equal. | `yarn check:conventions` |
| **ARCH-COMPAT-ROUTE** — A compatibility route — the legacy's wire a migrated application serves while its clients move to the contract's grammar — lives in the transport and nowhere else, is declared in the language's binding under `migration` with the one command or query of the inventory it stands for and the condition of its retirement, waits for the outcome with the awaited operation and answers the legacy's shape; under `api: native` none is declared, and nothing outside the transport waits for an operation. | `yarn check:conventions` |
<!-- end generated -->

### Who may import whom

The dependency table, per layer. `own` is the file's own context, `architecture` the building blocks, `kernel` the shared kernel, `others` any other context; anything not listed is refused, and the refusal names the rule. It is rendered here while a context is declared.

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

## The map: concept → file

One canonical example per concept, rendered from `conventions/concepts.yaml` and `conventions/typescript.yaml`.

### Domain layer

<!-- generated from conventions/concepts.yaml (domain); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Entity | [`Entity.ts`](src/Architecture/Domain/Entity.ts) | identity, `equals()` |
| Aggregate root | [`AggregateRoot.ts`](src/Architecture/Domain/AggregateRoot.ts) | behaviours enforce invariants and `record()` events |
| Value object | [`Email.ts`](src/SharedKernel/Domain/Email.ts) | built through `create()` → `Result`; never invalid once you hold one |
| Identity | [`Id.ts`](src/Architecture/Domain/Id.ts) | generated by the domain (`Id.generate()`), not by the database — ADR 2; born once, kept by every context that takes the thing up — ADR 33 |
| `Result` | [`Result.ts`](src/Architecture/Domain/Result.ts) | `IResult<T>` is the type you write in signatures |
| **Optimistic concurrency** | [`AggregateRoot.ts`](src/Architecture/Domain/AggregateRoot.ts) | the aggregate carries the version it was read at and never changes it; the repository stores version + 1 and refuses a stale one with `ConcurrencyConflict`, so of two writers who read the same version only the first wins — ADR 8 |
<!-- end generated -->

### Application layer

<!-- generated from conventions/concepts.yaml (application); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Guard (authorization) | [`Guards.ts`](src/SharedKernel/Application/Guards.ts) | *who may call* is answered here; *what they may do to which object* is the aggregate's business |
| Base handler (guard, transaction, safety net) | [`CommandHandler.ts`](src/Architecture/Application/CommandHandler.ts) | a concrete handler only writes `execute()` |
| Execution context | [`ExecutionContext.ts`](src/Architecture/Application/ExecutionContext.ts) | who is calling, with which logger, bus and unit of work; `withTransaction`, `afterCommit` |
| Publish after commit | [`CommandHandler.ts`](src/Architecture/Application/CommandHandler.ts) | ADR 3 |
| Transactional outbox | [`Outbox.ts`](src/Architecture/Application/Outbox.ts) | the facts a transaction makes durable with the state they describe, relayed to the bus after the commit; a crash after the commit loses nothing, the next relay publishes what is pending (ADR 24) |
| Awaited operation | [`AwaitOperation.ts`](src/Architecture/Application/AwaitOperation.ts) | a caller that must answer in one exchange — the compatibility route of a migrated application, serving the wire its clients already speak — waits for a command's outcome, for at most a deadline, on the same promise the outbox's relay acknowledges on; past the deadline the operation is still the answer, `202 { operationId }`, and the client follows it (ADR 36) |
| Retry on conflict | [`CommandHandler.ts`](src/Architecture/Application/CommandHandler.ts) | a command refused by a concurrency conflict is re-read and re-decided by its handler in a new transaction, up to three times; the third conflict is the client's (ADR 25) |
| **Projection / read model** | [`OperationProjection.ts`](src/Contexts/Tracker/Application/Projections/OperationProjection.ts), [`OperationRecord.ts`](src/Contexts/Tracker/Application/ReadModel/OperationRecord.ts) | a context with no aggregate at all |
| Module (wiring) | [`Module.ts`](src/Architecture/Application/Module.ts) | plain data: which handler answers which command, query, event |
<!-- end generated -->

### Infrastructure layer

<!-- generated from conventions/concepts.yaml (infrastructure); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example | Notes |
| --- | --- | --- |
| Event bus | [`InMemoryEventBus.ts`](src/Architecture/Infrastructure/EventBus/InMemoryEventBus.ts) | the only bus implementation |
| Idempotent delivery (the inbox) | [`InMemoryEventBus.ts`](src/Architecture/Infrastructure/EventBus/InMemoryEventBus.ts) | a fact relayed from the outbox may reach the bus twice; the bus recognises a message it already delivered to a subscriber by the message's id and delivers it once (ADR 24) |
| Decorator (cross-cutting concern) | [`TrackedEventBus.ts`](src/Contexts/Tracker/Infrastructure/TrackedEventBus.ts) | tracking layered on any bus; neither the bus nor the handlers know |
| Unit of work | [`InMemoryUnitOfWork.ts`](src/Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork.ts) |  |
| The "database" | [`InMemoryDataSource.ts`](src/Architecture/Infrastructure/DataSources/InMemoryDataSource.ts) | a `Map`; the ports are what a real adapter would implement |
<!-- end generated -->

### Presentation layer

<!-- generated from conventions/concepts.yaml (presentation); edit the YAML, then run the conventions check with --write -->
| Concept | Canonical example |
| --- | --- |
| Presenters (one use case, several formats) | [`Format.ts`](src/Architecture/Presentation/Format.ts) |
| Composition root | [`createApplication.ts`](src/Bootstrap/Fastify/createApplication.ts), [`Application.ts`](src/Architecture/Application/Application.ts), [`FastifyApplication.ts`](src/Bootstrap/Fastify/FastifyApplication.ts), [`application.ts`](src/Bootstrap/Fastify/application.ts) |
<!-- end generated -->

## Decisions

Why the architecture is the way it is, in the reference: [docs/adr](https://github.com/jgaNet/clean-ddd/tree/main/docs/adr).
Your own decisions go in [`docs/adr`](docs/adr/README.md), numbered from 1.
