# 47. The building blocks carry a database, and a restart is tested

## Context

J6 ran nine agent-built applications through forty requests, on PostgreSQL, from the skeleton `clean-ddd create`
gives ([the record](../evaluations/benchmark/three-arms/tally-run-2026-11-17.md)). Three things the skeleton did not
carry cost every tree, in every arm, and the record says so:

- **No test crosses a restart.** ADR 24 promises that a fact made durable and not yet published is published once by
  the next run. Every suite of this repository runs in one process, where the promise cannot be broken, so no tree had
  a test that held it, and the `relayOutbox()` line at start was the one line of the composition root nothing checked.
  Two trees of an earlier run told an archiving twice after a crash for that reason
  ([the record](../evaluations/2026-10-31-flow-robustness.md#the-defect-what-the-startup-relay-does-not-carry)).
- **No unit of work over a database.** The guide said "moving to a real store keeps the same shape" and left the shape
  to each tree: nine unit-of-work classes were written, five of them wrong the first time — an adapter that wrote
  through the pool and committed on its own beside the transaction, an outbox table written by another connection
  than the state, a lock taken through the pool that deadlocked the process when the pool ran out, a rule over several
  aggregates (a group's balances summing to zero) serialized by nothing while expenses landed on two servers.
- **No test database of a suite's own.** Suites that created a database and forgot it made sixteen hundred of them in
  an hour and filled the machine's disk twice; the run was stopped for it.

Each of the three is mechanics, not vocabulary: the kind of thing the building blocks are for, and the kind of thing
an agent should not have to invent under a request's clock.

## Decision

**The building blocks carry a PostgreSQL adapter**, under `Infrastructure/Postgres` beside the in-memory ones, and
`clean-ddd create` copies it with the rest of `src/Architecture`:

- `PostgresDatabase`: one pool for the process, the `outbox` table (`ensureSchema()`, idempotent, called at every
  start), a statement outside any transaction for the relay, and a borrowed connection for a transaction. It knows no
  table of any context's.
- `PostgresUnitOfWork`: one transaction on one borrowed connection, `BEGIN` to `COMMIT` or `ROLLBACK`, released
  after; `another()` borrows another connection, so a reaction's transaction is its own (ADR 30). `client` is that
  connection, the one an adapter of the context writes through, and it throws outside a transaction rather than
  borrow one: an adapter that commits on its own leaves the outbox behind. `lock(key)` takes an advisory lock
  (`pg_advisory_xact_lock`) on the transaction's own connection, released at its end, for a rule that spans several
  aggregates; a rule inside one aggregate has its version check and needs none. The in-memory stores of the process
  are snapshotted too, so a context still in memory beside the database keeps its boundary.
- `PostgresOutbox`: `append()` writes with the transaction's connection and refuses to be called outside one;
  `pending()` and `markPublished()` go through the pool, because the relay runs after the commit. A row comes back as
  an `Event` by its name and payload: the bus routes on the name, which is why a fact relayed after a restart reaches
  the same subscribers, and why a payload crossing a restart is JSON.

**The application a project starts from runs on it** when `DATABASE_URL` names a database: the transport takes a
`unitOfWork` factory (in memory when none is given) and `onStop` hooks, and the Starter's composition root opens the
database, relays its outbox at start and closes it at stop. The four contexts of this repository stay in memory: they
are the examples of the domain, and a database would make every suite need a server.

**A restart is tested**, in the Starter's end-to-end suite: a transaction commits a fact to the outbox and the
process stops before the relay; the next start on the same database publishes it under the entry's id, which the
Tracker answers; and the entry is then acknowledged, so a third start has nothing to relay. The suite is copied into
every created application and holds there whatever the project does to its store.

**A suite takes a database of its own** from `freshDatabase()` and drops it after: a name of its own on the server
`TEST_POSTGRES` names, created in `beforeAll`, every connection terminated and the database dropped in `afterAll`.
Without `TEST_POSTGRES` the suites that need it are skipped, and say so; CI starts a server.

**A move of the storage** (a file to a database, a server to another) is the composition root's business: once, at
start, before the server serves, in one transaction, the outbox's pending entries moved with the rest. The guide says
it; the building blocks do not do it, since what is moved is the context's.

`pg` joins the libraries only an adapter may import (`libraries` in the binding); the domain and the use cases never
see it. The other languages owe the same three things; their bindings say so until they carry them.

## Consequences

- A project on PostgreSQL inherits a unit of work, an outbox and a restart test that are right on day one, and writes
  its adapters against `client`; the five wrong shapes J6 saw have a canonical right one to copy.
- A suite that needs the database costs a server in CI and a line in `beforeAll`; one that forgets `drop()` is a
  review finding with a name.
- The transport has one more option and one more hook; a composition root that gives neither runs as before.
- The payload of an event that may be relayed after a restart is JSON: a `Date` comes back as its ISO string. An
  integration event already carries ISO strings by contract; a domain event that carries a `Date` and is reacted to
  only inside its context is read back by a reaction that runs after a restart as a string, and a handler that reads
  one parses it.

## When to revisit

- When a second store (SQLite, a document database) is carried: the shape of `client` and `lock()` is then decided
  for two stores, and the port it hides behind is written once.
- When a context of this repository moves to the database, so that an adapter over `client` with a version check has
  a canonical example in a context, not only in the guide's sentence.
- When the other languages carry theirs, and the restart suite becomes a case of the shared scenario rather than a
  suite of each tree.
