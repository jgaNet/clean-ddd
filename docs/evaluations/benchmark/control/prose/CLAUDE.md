# Working on notes-app (guide for AI assistance)

This application is built on Clean Architecture and Domain-Driven Design, in TypeScript. Its building blocks
(`src/Architecture`), its shared kernel (`src/SharedKernel`) and one context, the Tracker, are already here; the
features add bounded contexts beside it. The rules below are the architecture; nothing checks them for you
beyond the type checker, the linter and the tests, so hold the code to them yourself.

## Commands

```bash
yarn verify        # what must pass: typecheck, lint, format, tests
yarn typecheck
yarn lint
yarn format        # prettier, in place
yarn test
```

## Where things are

```
src/Architecture/     the building blocks: Entity, AggregateRoot, ValueObject, Result, the command, query and event
                      handlers, the execution context, the event bus, the outbox, the in-memory adapters. Mechanics, no vocabulary.
src/SharedKernel/     what every context agrees on: the shared kernel's model, and under Application/IntegrationEvents/
                      the integration events the contexts publish to one another.
src/Contexts/<Name>/  one bounded context: Domain/, Application/, Infrastructure/, Presentation/ and its wiring
                      file module.local.ts. The Tracker is the example of the shape.
src/Bootstrap/        the composition root (Fastify/createApplication.ts): the transport, the bus, each context's
                      module and its routes under its own prefix.
docs/adr/             the decisions: a new context, or a new relationship between two contexts, is one.
```

Import across directories through the path aliases (`@Architecture/…`, `@SharedKernel/…`, `@Contexts/…`,
`@Bootstrap/…`); a relative import names a sibling file only.

## The layers

Dependencies point inward:

- **Domain.** The Domain layer depends on nothing outside its own Domain, the building blocks' Domain and the shared kernel's Domain.
- **Application.** The Application layer depends on its own Domain and Application, the Domain and Application of the building blocks and of the shared kernel (integration events included), nothing else.
- **Infrastructure.** The Infrastructure layer implements its own ports; it may read another context's Domain (ports, read models) but not its Application, Infrastructure, Presentation or wiring.
- **Presentation.** The Presentation layer talks to its own Application layer (handlers, module) and Domain (read models, exceptions); never to Infrastructure, wiring, Bootstrap or another context.
- **The wiring file** (`module.local.ts`). A wiring file binds its own context and may import another context's wiring for what it exports; it never reaches inside another context.

## The rules

- **Dependencies point inward and contexts stay apart — each file imports only what its row of the dependency table allows; there is no exception and none may be added.** A boundary that can be crossed when convenient is not a boundary; the table is the architecture.
- **The building blocks import nothing outside themselves, not even the shared kernel; the shared kernel imports the building blocks and no context.** The building blocks are mechanics and must know no vocabulary, not even the roles; the shared kernel is the part of the domain model every context agrees on, built on those mechanics.
- **A context's wiring is one file building a Module as data — its name, its commands, its queries, its domain event and integration event handlers; anything else it exposes is a named export of that file. No container, no builder, no service locator.** Wiring that is data can be read in one screen and explained to an agent; a container hides which handler answers which command.
- **A command has exactly one handler — the Module lists it once, with one handler, and every command a route or a policy builds is one the Module lists; a fact may have any number of subscribers.** Commands and facts share one bus, and they differ in what an answer is — a command's outcome is its handler's result, so two handlers would answer with two outcomes and none with no outcome, while a fact is told to whoever listens and nobody is a fine answer.
- **ExecutionContext carries what exists per request and nothing else — who is calling, the trace, the transaction, the bus, the logger. A mailer, a clock, a model client is a constructor dependency of the handler that needs it.** A context that grows is a service locator with a better name; a handler's needs belong in its signature.
- **A refused command or query is a failed Result value, never a thrown exception; throwing (or panicking) is for programming errors and corrupted state only.** A refusal is a normal outcome the caller must handle; a throw is a crash that hides it.
- **Only an aggregate root records domain events (`record(...)` inside a behaviour); handlers never construct one, they call `publishDomainEvents(aggregate, context)` after saving.** The fact belongs to the object whose rule produced it; a handler that builds events can lie about what happened.
- **`create()` / `register()` validates and records a creation event; `fromSnapshot()` records nothing and throws on corrupted data.** Rebuilding from storage is not a business fact; corrupted storage is a programming error, not a refusal.
- **An aggregate generates its own identity (`Id.generate()` in `create()`). A repository loads and saves aggregates, and answers the facts a domain rule needs about the collection (`findByEmail`, `countByOwner`); it never hands out identities and never searches for a screen.** No persistence round-trip is needed to know who an object is, and the event of its creation can carry its id.
- **Time is a parameter with a default; identity is generated by the domain; anything else that is not a function of the business state (randomness, a model, a person, another system) lives behind a port named for what it decides, and its result is a plain value the aggregate validates and may refuse.** The same state and command must give the same outcome; the source proposes, the domain disposes.
- **Domain events are made durable with the state they describe, in the same transaction (the outbox), and published from there after the commit — never before, and never from memory alone; a rolled-back transaction stores nothing and leaves the events on the aggregate; a fact a crash kept from being published is published on the next relay, so a subscriber may see a fact twice and the bus delivers a message it already delivered once only; a reaction runs in a transaction of its own, and what it saves and what it publishes are made durable and published the same way.** Listeners must only ever see facts that are durable, and every durable fact must reach them; publishing from memory after the commit loses the facts a crash interrupts, so the facts are stored first and at-least-once delivery is paid for with idempotent delivery.
- **Queries return read models, repositories return aggregates; never the other way.** The read side is free to be shaped for screens; the write side is where the rules live.
- **Contexts talk in two ways only — integration events published in the shared kernel, and ports the asking side owns, answered by an adapter over the other context's read model; a context's Domain never imports another context.** The contract between contexts must be a visible, versionable file, not a class that changes for its own reasons.
- **An aggregate carries the version it was read at and never changes it; `save()` stores version + 1 and refuses an aggregate that is no longer at the stored version with a ConcurrencyConflictException; the command handler then re-reads and re-decides in a new transaction, up to three attempts, and the third conflict is the operation's refusal.** A consistency boundary is only as good as the write; of two writers who read the same version only the first may win, and the second, re-run on what the first wrote, usually wins too — a rule re-decided on fresh state is a decision, a write re-applied blindly is not.

## How to add a feature

The domain first (a behaviour on the aggregate that enforces the rule and records an event), then the
command or query handler, then the adapter only if a port changed, then the route, then the wiring in
`module.local.ts`. A rule that spans aggregates or needs a port is a domain service. Expected failures are
`Result` values, never thrown. A command answers `202 { operationId }`, followed at the Tracker. A new
context is registered in the composition root, as the Tracker is, and recorded in `docs/adr`.

## Things to avoid

- A generic `Mapper`, `Repository<T>`, `Saga`, service locator or DI container.
- Crossing a boundary because it is convenient: a port, an integration event or a move instead.
- Changing `src/Architecture` or `src/SharedKernel` for one feature's convenience.
