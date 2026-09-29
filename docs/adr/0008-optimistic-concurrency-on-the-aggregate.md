# 8. Optimistic concurrency on the aggregate

## Context

An aggregate is a consistency boundary: its invariants hold because every change goes through one object that sees the whole state. That promise is only as good as the write. Two handlers can load the same note, each apply a rule that holds against what *it* read, and each save — the second silently overwriting the first, and the invariant the second checked no longer holding against what is actually stored. Nothing in the domain model can see this: it happens between the read and the write.

## Decision

Every aggregate root carries the **version** it was loaded with ([`AggregateRoot.version`](../../src/Architecture/Domain/AggregateRoot.ts)): 0 when just created, the stored version otherwise. The aggregate never changes it; it is a fact about what was read, not about what happened. A repository's `save()` **refuses an aggregate whose version is not the stored one** and stores `version + 1` otherwise, so of two writers who read the same version only the first wins; the second gets a failed `Result` with a `ConcurrencyConflictException` ([`CommonExceptions.ts`](../../src/Architecture/Domain/CommonExceptions.ts)), which the handler returns like any other refusal and the client sees on the operation.

The check is the adapter's, in whatever way its store makes atomic: the in-memory repository compares the stored version under JavaScript's single thread; the SQLite repository writes `UPDATE … WHERE id = ? AND version = ?` and treats zero changed rows as the conflict ([`SqliteNoteRepository.ts`](../../src/Contexts/Notes/Infrastructure/Repositories/SqliteNoteRepository.ts)). [`NotePersistence.contract.spec.ts`](../../src/Contexts/Notes/Infrastructure/NotePersistence.contract.spec.ts) holds both to it.

The canonical example is `Note`, the one aggregate here with several writers (the owner edits and archives; recipients are added by sharing). `Account` and `Notification` carry a version too, since it comes from the base class, but their repositories do not check it yet: each instance has a single writer today. When a second one appears, the repository copies the Note shape.

## Consequences

- `INoteRepository.save()` returns an `IResult`: a conflict is an expected outcome of concurrent use, not a crash ([ADR 1](0001-result-instead-of-exceptions.md)). Every Notes handler checks it in one line.
- A conflict is refused, not merged: the client re-reads and decides again. That is the right default for a business rule; merging is a product decision, per behaviour, and none has asked for it.
- The snapshot gains a `version` field and the SQLite table a column. Read models do not expose it: a screen has no use for it, and a client that wants "edit what I saw" sends a command, not a version.
- The in-memory unit of work still restores whole stores on rollback ([ADR 3](0003-publish-domain-events-after-commit.md)); the version check protects against lost updates *between* transactions, not against interleaving *inside* one.

## When to revisit

If a behaviour must be applied to whatever is current rather than to what was read (a counter, a "like"), model it as an event the store applies, not as a version-checked save. If clients need "edit what I saw" across requests, the version becomes part of the command's payload and of the read model, and the refusal a `409` on the query side.
