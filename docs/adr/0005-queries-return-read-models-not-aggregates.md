# 5. Queries return read models, not aggregates

## Context

A screen wants a list of notes with their titles and statuses; an API wants a note with its content and who it is shared with. The aggregate can produce all of that through getters, and it is tempting to have queries return aggregates and let the presentation pick fields. Then the read side drags the business rules, the private fields and the events along for every list, and cannot be shaped, indexed or cached differently from the write side.

## Decision

Two ports per aggregate, with different return types:

- the **repository** ([`INoteRepository.ts`](../../src/Contexts/Notes/Domain/Note/Ports/INoteRepository.ts)) loads and saves the aggregate. It is the write side. It has no "search" method.
- the **queries** ([`INoteQueries.ts`](../../src/Contexts/Notes/Domain/Note/Ports/INoteQueries.ts)) return **read models**: plain shapes tailored to a use case (`NoteListItem`, `NoteDetail`, `SharedNoteListItem`). They never return an aggregate and nothing they return goes back into the domain.

Query handlers depend on the queries port; command handlers depend on the repository. A read model deliberately leaves things out — the account read model has no credentials ([`IAccountQueries.ts`](../../src/Contexts/Security/Domain/Account/Ports/IAccountQueries.ts)).

Tracker takes this to its conclusion: it has **only** a read model, fed by a projection of the event stream, and no aggregate at all.

## Consequences

- The write side can stay strict and small; the read side can be denormalised, paginated, cached or served from another store without touching the domain.
- The API never leaks internals by accident: the read model is the contract.
- Here both sides read the same in-memory `Map`. The split is in the ports and the types, which is where it has to be for a real split to be a local change later.

## When to revisit

When a read model becomes expensive to build on the fly, move it to a projection updated by domain events (Tracker shows the shape). The ports do not change.
