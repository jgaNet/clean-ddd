# 30. A reaction is a transaction of its own, publishes through the outbox, and is not made idempotent by hand

## Context

A command handler runs in a transaction the base class opens: it loads, decides, saves and publishes, the outbox makes the facts durable with the state they describe, the relay publishes them after the commit, and the bus hands a message to a subscriber once, by its id ([ADR 24](0024-events-are-durable-before-they-are-published.md), [ADR 25](0025-a-conflict-is-retried-from-a-fresh-read-then-refused.md)). A reaction — a domain event handler, an anti-corruption handler — had none of that. It ran in the publisher's own execution context, outside any transaction, and published what it told other contexts straight to the bus.

Phase 2 of the flow ([the record](../evaluations/2026-10-29-flow-phase-2.md)) put four agents on one cross-context feature, *notify recipients when a shared note is archived*: a reaction in Notes that publishes the fact, and one in Notifications that creates a notification per recipient. All four delivered it, and three questions came back from them, about correctness rather than shape:

- **How does a reaction publish, durably?** Three of four asked. All published the integration event straight to the bus, under a fresh id. A fact published that way is in memory only: a crash before it is handled loses it, and a reaction delivered twice tells the consumer twice under two ids, which the inbox cannot recognise.
- **Does a reaction that saves several aggregates open a transaction?** Both consumers asked, and both saved one notification at a time outside any. One of them also saw why it could not simply call `withTransaction()`: the bus delivers synchronously while the publisher's transaction is still open in the same context, so the reaction's transaction would count as nested, and its outbox steps would be dropped when the outer one finished.
- **Must a consumer's fan-out be idempotent?** The two consumers differed. One added a repository question (`existsFor(recipient, note, archivedAt)`) and skipped those already told, because a save failing half-way through the recipients would, on retry, notify the first ones twice. The other did nothing and said so.

The three are one question: what a reaction is, as a unit of work.

## Decision

**A reaction runs in a transaction of its own, in a context of its own.** The base `EventHandler` opens it: `handle()` derives the reaction's context from the one the fact travelled with (`forReaction()`: the same caller, trace, bus and logger, and a unit of work of its own — `UnitOfWork.another()`, the same stores and outbox, another transaction) and runs `execute()` in `withTransaction()`. What the reaction saves, and the facts it records or publishes, commit together or not at all. Its transaction is neither the publisher's, which has committed, nor that of another reaction to the same fact running beside it, so the timing of the bus decides nothing.

**What a reaction publishes goes through the outbox.** `publishIntegrationEvent(event, context)` makes a fact for other contexts durable the way `publishDomainEvents()` makes an aggregate's facts durable: appended to the outbox at commit, relayed after it, under the entry's id. The reaction that translates a domain event into the published contract calls it; `context.eventBus.publish()` is for a controller sending a command, never for a reaction.

**A reaction is not made idempotent by hand.** All or nothing (the transaction), one id per fact (the outbox) and the bus's inbox together hand a fact to a reaction once, and make its effect happen once. A fan-out that fails half-way is undone whole, so its next delivery starts clean. The `existsFor` an agent wrote is correct and unnecessary. What a durable store owes in return is to write the inbox entry in the reaction's own transaction, so that *handled* and *done* are one fact. The in-memory inbox records it once the reaction has succeeded, which in one process is the same moment.

The rule is EVENT-AFTER-COMMIT's, extended to say so; there is no new rule. The guide of each language answers the two questions that came with these: the facts a reaction needs are the ones of that moment, carried by the domain event rather than read back; and a time in an integration event's payload is an ISO 8601 string.

## Consequences

- **Every reaction gets a transaction**, including those that only log. With an in-memory unit of work that is a snapshot of the stores; with a database, a short transaction. The cost is paid for one shape everywhere.
- **The in-memory unit of work's honest limit now reaches reactions.** Its rollback restores whole stores, so it is not isolated from work interleaved with it ([ADR 24](0024-events-are-durable-before-they-are-published.md)). A reaction that fails while another writes beside it undoes that one's writes too. It was already true of two requests, and a database removes it.
- **The reference's reactions publish through the outbox**: the reaction that publishes that a note was shared, and the two that publish that an account was created or validated.
- **A context that only consumes still cannot show its reaction in its own end-to-end suite**, which speaks HTTP and may not reach the bus (ARCH-E2E). The handler's spec shows the reaction; the flow is shown where both contexts are wired. That is now said in the guide, rather than discovered.
- **Every language carries the same three answers in its own idiom**: a reaction's own context and transaction in its base handler, a `publishIntegrationEvent` (or its language's name for it) through the outbox, and the reference's reactions using it.

## When to revisit

If a reaction ever needed to join the transaction that published its fact — a projection that must be consistent with the write it projects — it is not a reaction but part of the command, written in the handler that decides. If reactions became numerous enough that a transaction each were a cost, a reaction that saves nothing could be exempted, at the price of a second shape.
