---
name: migrate
description: Move one or several existing projects onto this architecture without changing what they do — record the characterization scenario against the legacy, read the storm from its code, create the application, write one context per lane, choose the wire it answers on (the legacy's beside the contract's, or the contract's alone), and prove the scenario passes unchanged on the first and translated on the second. Use when someone has a project, or a list of projects, they want on clean-ddd, in product words or as a repository.
---

# Migrating a project

A migration keeps the behaviour and chooses the wire ([ADR 35](../../../docs/adr/0035-a-migrated-application-keeps-its-behaviour-and-chooses-its-wire.md)).
It is a kind of work of its own: not a feature, since the functionality is given and must not change;
not an architecture change, since the architecture is what the work moves into. Its invariant is the
one thing to prove at the end: **the same functionality, in a new shape**. Two fidelities hide under
that sentence, and this skill keeps them apart from the first step:

- **the behaviour** — the facts, the commands, the rules that refuse: what the storm names and the
  scenario asserts; it is always kept;
- **the wire** — the routes, status codes and bodies the clients speak: it is chosen, `compat` (the
  legacy's routes served beside the contract's grammar while the clients move) or `native` (the
  contract's grammar alone), and the choice may change later without reopening a context.

What a migration costs is what [ADR 31](../../../docs/adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md)
measured, multiplied by the legacy's size: the first one by hand turned 101 lines into 654
([the record](../../../docs/evaluations/2026-11-08-migration-by-hand.md), [the kit](../../../docs/evaluations/benchmark/migration/README.md)).
Say so before starting. The architecture pays where several agents work on boundaries decided in
advance, and a legacy of several projects is exactly that; a legacy of one project with one context
gains nothing on delivery and should know it. Data is not migrated: a schema and its rows are not
a functionality, and the new application's adapters may read the legacy's store.

The tooling is the root's (`yarn architecture …` here, `clean-ddd …` in a created application);
every command takes `--json`. Nothing here replaces the `feature` and `storm` skills: this is the
order in which a migration uses them.

## 1. Read the legacy, and say what it is

Read the project (or each project) as a client and as a maintainer, and write down, before anything
else:

- **its routes**, with the verb, the status codes each answers, the body shapes, the error bodies and
  their sentences, the order each list promises;
- **its stores** — a table, a collection, a `Map` — and what each row is;
- **the writes a request makes beside its main one** (an activity log, a counter, a notification, a
  mail): those are the facts and the policies;
- **what it calls outside** (a clock, a mailer, another service): those are the ports;
- **what it reads as missing or coerces** (a field of the wrong type, a default): the leniencies a
  compatibility wire will have to own.

With several projects, the boundaries between them are the first draft of the contexts, and every
call from one to another is a relationship. A relationship is a decision (CTX-MAP-DECLARED): it is
declared in `conventions/domain.yaml` with its pattern and its reason before any storm names it.

## 2. Record the characterization scenario, first

Before any code of the migration, write the scenario that characterizes the legacy, black-box over
HTTP, the way `api/scenario.mjs` holds every language of this reference: one step per thing a client
relies on, asserting the status code and the body **field for field**, the order of every list, and
the exact sentence of every refusal. Make it filter what it reads to the things of its own run, so
that it passes on a server that already holds data; run it against the legacy twice.

It is the acceptance test of the migration. A behaviour it did not record is a behaviour the
migration may lose: widen it whenever a gap is found, and never edit it to make the new server pass.
`docs/evaluations/benchmark/migration/scenario.mjs` is the example, with its `--native` flag (step 7).

## 3. Read the storm from the code

Hold the `storm` skill's session with the legacy standing in for the people in the room, and ask
its questions of the code:

| In the legacy | On the wall |
| --- | --- |
| a route that changes state | a command: public name, actor, route in the HTTP grammar (`yarn architecture verb <intent>`) |
| a route that reads | a query: public name, actor, `GET` route; the order it promises is part of the model |
| a store, and the rules checked before writing to it | an aggregate, its value objects, the exceptions it refuses with |
| a write made beside the main one | a fact the aggregate records, and a policy that reacts to it |
| a call outside | a port named for what it decides |
| a thing two projects name differently | two contexts, and a pivot between them |

Every question the code does not answer is a **hot spot**, to decide with the people who own the
legacy and to write down with its decision: who may act (a legacy without accounts means *anyone*),
whether a repeated action is a refusal or a no-op (a `409` was a refusal), whether a side write is a
projection or an aggregate of its own (a feed nobody writes to and no rule lives in is a projection),
where a time comes from (a parameter with a default, carried by the fact), and what to do about the
wire (step 4). A session with no room is the maintainer deciding alone; the record must say so.

Write `conventions/storms/<application>.yaml` as the `storm` skill says, in the inventory's words,
`done: false`, and validate it:

```bash
yarn architecture storm validate conventions/storms/<application>.yaml
```

Nothing of the legacy's wire goes in the storm: a storm is one file for every language, and the
wire is a transport concern.

## 4. Create the application, and choose the wire

```bash
yarn architecture create <dir> --name <application> [--language <id>]
```

Declare each context in the binding (`contexts`) and in the domain map; `yarn architecture checklist
context` says what a context is made of. Then choose the wire, in the binding:

```yaml
migration:
  api: compat          # or native
  compatibility_routes: []   # filled in step 6 under compat
```

- **`native`**: the contract's grammar alone, under the transport's prefix. The clients change with the
  server; the scenario is translated (step 7).
- **`compat`**: the legacy's routes beside the contract's grammar. **The two wires cannot share a
  path** — the legacy's `POST /v1/links` answers `201` with the thing, the contract's answers the
  same route `202` with an operation id — so the compatibility wire keeps the legacy's prefix and
  the native grammar is served under the next one (`v1` and `v2`). Give the composition root an
  option for the legacy's prefix (`legacyWire: { prefix: 'v1' }`), `undefined` serving the native
  wire alone; the end-to-end suites use both.

The choice is reversible: nothing of a context differs between the two, and switching is step 8.

## 5. Write the contexts

One context per lane of the storm, under the `feature` skill, in the shape of the reference's
canonical files (`yarn architecture checklist <kind>`): the value objects carry the rules the legacy
checked where the requests arrived, the aggregate records the facts the legacy wrote beside its main
write, the policies write the projections, the queries answer the read models **in the shape the
legacy answered** so that the compatibility wire has nothing to reshape. A legacy of several
contexts is the flow's case: one agent per context, in its own worktree, against the storm as the
frozen contract ([`.claude/flow`](../../flow/README.md)).

Two things a created application does not have, which the canonical files assume: Swagger `tags` in
a route's schema (drop them), and the shared scenario (its own end-to-end suite is the proof).

## 6. Write the compatibility wire (under `compat`)

One file under the transport (`src/Bootstrap/Compat/legacy.routes.ts` in TypeScript), registered by
the composition root under the legacy's prefix, and **declared** in the binding, one entry per route:

```yaml
migration:
  api: compat
  compatibility_routes:
    - { method: POST, path: /links, operation: SaveLink, file: src/Bootstrap/Compat/legacy.routes.ts, retires: when the mobile application 2.x is out of support }
```

`operation` is the public name of the one command or query the route stands for, as the inventory
spells it; `retires` is a date (`YYYY-MM-DD`), which the check holds and refuses once past, or the
condition in words. Each route:

- **builds the command as a controller does** and publishes it on the request's bus, then waits:
  `awaitOperation(operation)` (the concept *Awaited operation*; `yarn architecture concept awaited-operation`);
- **answers the legacy's shape from the read model** once `hasOutcome(operation)`: a create's new id
  is the operation's result, read back through the query; a refusal is mapped **from the rule's
  name to the legacy's status and sentence**, in one table at the top of the file;
- **answers the contract's grammar past the deadline**: `202 { operationId }`, followed at the
  Tracker; nothing is cancelled;
- **owns the legacy's leniency**: a field the legacy read as missing when it was of the wrong type is
  coerced here (to the empty string, say), so that the domain refuses it by name and the name maps to
  the legacy's sentence; the native wire's schema stays shape-only (API-BODY-SHAPE).

No rule lives in the façade, and nothing outside the transport waits for an operation: the check
refuses a wait in a context (ARCH-COMPAT-ROUTE). The example is
[`legacy.routes.ts`](../../../docs/evaluations/benchmark/migration/migrated/src/Bootstrap/Compat/legacy.routes.ts).

## 7. Prove it

```bash
yarn check:conventions && yarn lint && yarn typecheck && yarn test:units && yarn test:e2e
yarn architecture storm --expect conventions/storms/<application>.yaml   # nothing still owed
node <scenario> http://127.0.0.1:<port>             # compat: the legacy's scenario, unchanged
node <scenario> http://127.0.0.1:<port> --native    # native: the same steps, translated
```

- **On the compatibility wire the scenario runs as recorded**, without a change: that is the proof
  that the functionality did not change. Run it more than once.
- **On the native wire it is translated**, and the translation is every difference between the two
  wires and nothing of what happened: a command's `202`, the operation followed at the Tracker, its
  result read back, its ERROR mapped from the rule's name to the legacy's status and sentence — **and
  a query's refusal too** (`404 { message }` on the contract's grammar, the legacy's body on its
  own). Keep the translation in one place of the scenario; it is what a client moving from one wire
  to the other has to write.
- The check holds the declaration: a route served from outside the transport, one bound to nothing
  the inventory lists, one with no retirement or past its date, any route under `native`, a wait
  outside the transport.
- A projection the legacy wrote in the same request is written after the commit here. In-process it
  was never seen lagging; against a store with latency, if the scenario sees it, that is a finding
  for the record and a hot spot for the storm, not a reason to write the feed from the handler.

Then `done: true` in the storm, and the record: what was guessed, what the building blocks lacked,
what a created application left open. Every migration adds to
[`docs/evaluations`](../../../docs/evaluations/README.md) as the first one did.

## 8. Switching wires later

To `native`: remove the Compat folder and the composition root's option, delete the
`compatibility_routes`, say `api: native`, set the transport's prefix back if the clients were told
so. No file of a context changes. To `compat` from `native`: step 6. The check refuses the half-way
states on both sides.

## What you never do

- Edit the scenario to make the new server pass, outside its translation layer.
- Put a rule in the façade, or a wait in a context: the façade maps names to the legacy's answers,
  and the controller of a context answers `202`.
- Name the legacy's wire in the storm, or declare a context or a relationship from inside one.
- Migrate the data, or promise the clients that nothing changes when the native wire is chosen.
- Start the code before the scenario is recorded against the legacy.
