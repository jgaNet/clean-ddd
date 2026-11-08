# 35. A migrated application keeps its behaviour, and chooses the wire it answers on

## Context

The reference knows two ways to get an application: made from nothing by `create` ([ADR 27](0027-a-created-application-starts-with-the-tracker.md)) and grown feature by feature, each feature decided in a storm before its code ([ADR 22](0022-the-storm-is-facilitated-and-the-code-is-held-to-it.md)) and written by the flow, one agent per bounded context when the feature crosses several ([RFC 0001](../rfc/0001-architecture-aware-multi-agent-flow.md)). Most software a team would want in this architecture already exists: one project, or several, with clients that speak its API and a behaviour nobody wrote down. Moving it is a third kind of work. It is not a feature, since the behaviour is given and must not change; it is not an architecture change, since the architecture is what the work moves *into*. Its invariant is the one neither mode names: the same functionality, in a new shape.

Two fidelities hide under "the same functionality", and the contract keeps them apart whether we want to or not.

- **The behaviour**: the facts, the commands, the rules that refuse. It is what a storm names, in the words every language shares, and what a black-box scenario asserts.
- **The wire**: the routes, the status codes and the body shapes the clients speak. The contract has one grammar for it ([the HTTP table](../../conventions/architecture.yaml), API-ONE-SURFACE): a command is answered `202 { operationId }` and followed at the Tracker, a query answers synchronously. A legacy API that answers `201` with the thing it created cannot be served by that grammar, and the contract allows no second one.

A team migrating usually needs both, one after the other. Its clients cannot all change the day the new server starts, so the wire must hold first; once they have moved, the native grammar is what the application should answer, and the legacy's routes should go. Sometimes the order is the reverse: a new front end is written for the contract's grammar, and an old integration keeps the old wire for a while. In either case the choice must be reversible, and switching must not reopen the contexts.

[ADR 31](0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) says what the architecture was measured to buy: locality, no drift, and a safe fan-out of agents over boundaries decided in advance. A migration is the case where those boundaries exist before the code — the legacy's projects, modules and tables are a first draft of the contexts — and where several agents are wanted on one codebase. It is offered under the coordinator claim, not as a faster way to rewrite.

## Decision

**A migration is a kind of work of its own, named `migrate`.** It takes one or several existing projects and produces one application made by `create`. Its contract stage is the storm's, with the legacy standing in for the people in the room: the facilitator's questions are asked of the code — the routes, the models, the jobs, which words each project uses for the same thing — and answered as storms in `conventions/storms/`, with the subdomains, the contexts and the context map in `conventions/domain.yaml`. Before any code, the behaviour is recorded as a **characterization scenario** against the legacy, black-box, the way `api/scenario.mjs` holds every language of the reference. The build is the flow's, the storms as its backlog, one agent per context. The proof is the gate, the storms carried, and the scenario passing against the new server. A migration is not a third mode in the sense of [ADR 9](0009-work-is-done-in-one-of-two-modes.md): the trees it produces are held to the same rules as any other, and `mode feature` and `mode architecture` still say which rules a change in them is held to.

**The behaviour is always kept; the wire is chosen, and the choice may change later.** A migrated application has two surfaces it can answer on:

- **`native`**: the contract's grammar. The characterization scenario is translated to it — a `201` and its body become a `202`, the operation followed, the result read at the Tracker — and replayed.
- **`compat`**: the legacy's routes, served by a façade. The scenario is replayed as it was recorded, without translation, which is the strongest proof of "the same functionality" the migration can give.

The choice is a setting of the migrated project (`migration.api`), read by the skill that drives the migration and by the check. The two surfaces may be served at once, for as long as the clients take to move.

**The compatibility surface is a façade in the transport, and nothing else differs between the two settings.** Under both, the storms, the contexts, the commands, the aggregates, the handlers and their tests are identical; the setting touches no file of a context. A **compatibility route**:

- lives in the composition root's tree (`Bootstrap`), which may import every context, and never inside a context;
- is bound to exactly one command or one query the inventory lists, which it builds as a controller would, from the legacy's request;
- waits for the command's outcome, then answers in the legacy's shape — status code, headers, body — and maps a refusal the way the legacy refused;
- is outside the contract's HTTP grammar and is declared as such, with the condition of its retirement (a date, a client count, a version), so that a route meant to disappear says so where the check can read it.

Switching to `native` is removing the façade. The check holds the setting: a compatibility route outside the transport, one bound to nothing the inventory knows, and, under `native`, any that remains, are refused. The kind of thing a compatibility route is, and the check that holds it, are declared in the contract in the change that follows this record; the façade is written by no one before they exist.

**Waiting for an outcome is a building block, on the promise the outbox already uses.** `awaitOperation(operation, { timeoutMs })`, in the Application building blocks, resolves with the operation once its handler has decided it or once the deadline has passed, whichever comes first; `hasOutcome(operation)` says which. The wait is on the operation's `delivered`, the promise the outbox's relay acknowledges an entry on ([ADR 24](0024-events-are-durable-before-they-are-published.md)): it settles once every subscriber the message reached has finished with it, and a command has one, its handler ([ADR 26](0026-a-command-has-exactly-one-handler.md)), so when it settles the operation carries the handler's verdict and a tracking bus has recorded it. The `EventBus` interface does not change, and no handler knows it is being waited for.

- **Past the deadline, the façade answers the native answer**: `202 { operationId }`. Nothing is cancelled; the handler finishes and the Tracker records it, and the client follows the operation like any other. This is the one point where the compatibility surface is not the legacy's wire, and it is stated rather than hidden: a slow command degrades to the contract's grammar, never to an error and never to a timeout the client cannot act on. The deadline is a parameter with a default, as time is everywhere in the domain (DOMAIN-NON-DETERMINISM).
- **A bus that cannot tell when a message was delivered** leaves `delivered` undefined, and the wait returns at once, still pending: a compatibility surface needs a bus that can tell, as the outbox's acknowledgement does.
- **A controller inside a context has no use for it.** A command's route answers `202`; a controller that waited would be a second grammar inside a context, and the check that holds compatibility routes is also what refuses the wait anywhere but in the transport.

**TypeScript first.** The building block, its tests and the concept in the map are TypeScript's in this change. The other languages' bindings show the gap, as [ADR 31](0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) says they do for whatever this work adds; a language that migrates a project carries the block in its idiom then (in Rust the dispatch is spawned, [ADR 14](0014-in-rust-the-transport-spawns-the-dispatch-and-finds-handlers-by-their-message.md), so the wait is a join with a deadline).

## Consequences

- **This change carries** this record, `awaitOperation` with its spec, and the concept *Awaited operation* in the map. **The changes that follow** carry, in this order: the kind *compatibility route* in the contract, with the `migration.api` setting and the check that holds both; then the `migrate` skill — written after one migration has been done by hand, with the `storm` skill and the flow, on one small project, so that the skill describes a migration that was seen and not one that was imagined. That is how every guide of this repository is written ([the evaluations](../evaluations/README.md)).
- **The wire is written twice while both surfaces are served**: once in the contexts' routes, once in the façade. The second copy is kept honest by its binding to one command or query, by the scenario replayed against it, and by its declared retirement. It is temporary by declaration, and the check says when the declaration is overdue.
- **A migration costs what [ADR 31](0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) measured, multiplied by the legacy's size.** The fan-out by context is where the cost is recovered; a legacy of one project with one context gains nothing from the architecture on delivery, and the record says so before the work starts.
- **Data is not migrated.** A schema and its rows are not a functionality; the persistence adapters of the new application may read the legacy's schema, which is what adapters are for, and moving the data is a project of its own.
- **The storm carries the facts; the scenario carries the rest.** Validations the legacy never named, edge cases, the order of a list: a storm does not say them, and a characterization scenario recorded before the code does. A behaviour the scenario did not record is a behaviour the migration may lose, so the scenario is written first and widened whenever a gap is found, never the code alone.
- **`awaitOperation` is a mechanic any caller in one exchange may use** — a test helper, a command-line tool, a façade. The restriction is on the grammar a context's route answers, not on the function.

## When to revisit

- **If a compatibility surface is needed for good** — a partner's integration that will never move — its retirement condition says so, and the route is reviewed as any other; the kind stays, the check stops asking when.
- **If a migrated application needs the wait somewhere other than a façade** in a way the grammar forbids (a synchronous command inside a context), that is a request for a second HTTP grammar in the contract, decided for every language, not an exception for one route.
- **If the deadline's degradation to `202` turns out to break the clients it was meant to keep**, the façade may hold the connection longer or answer the legacy's own timeout; either is a change to the façade's kind in the contract, and this record is revised with the case that asked for it.
- **If the first migration done by hand shows that the storm cannot be read from the legacy** — the facts too implicit, the words too mixed — the skill facilitates the session with the people who know the legacy, and reads the code as evidence rather than as the room.

## Revision: the kind is in the contract

The change after this record declares the compatibility route in the contract and holds it, as the decision asked.

- **The contract** names the two wires under `migration.api` (`native`, `compat`), each with what it means, and the rule ARCH-COMPAT-ROUTE, held by the check.
- **The binding** carries the choice: `migration.api`, and under `compat` the `compatibility_routes`, each with its method and path, the one `operation` of the inventory it stands for, the `file` under the transport that serves it, and `retires`. A retirement is a date the check holds — a route past its date is refused until it is removed or decided again — or the condition in words, which the check cannot hold and does not. An application that was not migrated has no `migration` section, which is `native` with nothing declared.
- **The check** refuses a route served from outside the transport, one bound to nothing the inventory lists, one with no retirement, one past its date, any route declared under `native`, and, in the tree this tooling reads, a file outside the transport and the building blocks that imports the wait; a spec may, since a test helper is a caller in one exchange too. The inventory it asks is the tree's where this tooling reads one, and the one the language's tool wrote elsewhere.
- **The façade itself is not written here.** The reference was migrated from nothing and declares no route; the first compatibility route is written in the first migration done by hand, and what it needs that the building blocks lack is reported then.
