# 3. Domain events are published after the transaction commits

## Context

A command handler saves an aggregate and publishes the events it recorded. If the events go out *inside* the transaction and the commit then fails, listeners have reacted to a fact that never happened: a welcome email for an account that was rolled back, a notification for a note that does not exist.

## Decision

`CommandHandler.publishDomainEvents()` hands the work to `ExecutionContext.afterCommit()`; the events are pulled from the aggregate *inside* that callback, so what goes out is everything the aggregate recorded during the transaction, and a rollback leaves them on the aggregate, unpublished ([`DomainEvents.spec.ts`](../../src/Contexts/@SharedKernel/Application/DomainEvents.spec.ts)) ([`ExecutionContext.ts`](../../src/Contexts/@SharedKernel/Application/ExecutionContext.ts)). Callbacks registered there run:

- once the outermost `withTransaction()` has committed — nested transactions join the outer one;
- never, if the transaction returned a failure or threw;
- immediately, when there is no transaction at all (a handler called directly, outside `handle()`).

[`ExecutionContext.spec.ts`](../../src/Contexts/@SharedKernel/Application/ExecutionContext.spec.ts) pins all four behaviours.

## Consequences

- Listeners only ever see committed facts. What a listener does with a fact is its own operation: `EventHandler.handle()` awaits the reaction and records its outcome (SENT, or ERROR with the failure) on the operation, so a failing reaction is visible in the trace rather than lost; it can never undo the committed fact it reacted to.
- The in-memory unit of work really rolls back: it snapshots every in-memory store when a transaction begins and puts them back on rollback ([`InMemoryUnitOfWork.spec.ts`](../../src/Contexts/@SharedKernel/Infrastructure/UnitOfWork/InMemoryUnitOfWork.spec.ts)). Its limit: two transactions interleaving writes on the same store are not isolated from each other, because the snapshot is of the whole store. A database isolates them; that is the next honest gap, listed in the README.
- Publication is best-effort after commit: if the process dies between the commit and the publish, the event is lost. This is the **single-process, in-memory version** of the guarantee. It is honest about what it does and does not promise.
- The handler code does not change: `this.publishDomainEvents(aggregate, context)` reads the same as before; the timing is the base class's concern.

## When to revisit

The moment events cross a process boundary (a message broker, a second service), replace the in-memory deferral with a **transactional outbox**: write the events to the same store in the same transaction, and let a relay publish them. The `afterCommit` hook is where that relay would plug in; the aggregates and handlers would not change.
