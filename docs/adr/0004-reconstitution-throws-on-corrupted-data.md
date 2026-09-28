# 4. Reconstitution throws on corrupted data

## Context

An aggregate is rebuilt from persistence through `fromSnapshot()` ([`Note.ts`](../../src/Contexts/Notes/Domain/Note/Note.ts)). The snapshot went through the same value objects when it was created, so it *should* be valid. But what if it is not — a manual edit in the store, a migration that went wrong, a rule that changed since?

## Decision

`fromSnapshot()` re-runs the value objects' validation and **throws** if it fails, instead of returning a `Result`. A corrupted snapshot is not an outcome the business anticipates (see [ADR 1](0001-result-instead-of-exceptions.md)); it is a programming or operational error, and the loudest possible signal is the right one. No event is recorded during reconstitution: nothing new happened.

## Consequences

- Every `Note` and `Account` in memory is valid, whether it came from `create()` or from the store. Behaviours never re-check what the constructor guaranteed.
- Callers of `repository.findById()` do not handle a "corrupted" case; the process fails fast and the operator learns about it.
- **Trade-off to keep in mind:** this re-applies *today's* rules to *yesterday's* data. If `NoteTitle.MAX_LENGTH` shrinks from 100 to 50, every note with a 60-character title stops loading. Tightening a value-object rule therefore requires migrating existing data first, in the same change. The comment on `Note.fromSnapshot()` says so.

## When to revisit

If rules change often, or if data outlives rules by years, the alternatives are: a reconstitution path that bypasses validation (which weakens the guarantee above), or versioned snapshots with an upcasting step before `fromSnapshot()`. Both are heavier than this project needs today.
