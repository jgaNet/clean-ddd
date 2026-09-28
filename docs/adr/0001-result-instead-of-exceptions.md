# 1. Result instead of exceptions for expected failures

## Context

A command can be refused for many ordinary reasons: the title is blank, the caller is not the owner, the note is archived, the email is already taken. These are not bugs; they are outcomes the business anticipates and the client must be told about. Throwing for them mixes two very different things in one channel — "this request is not acceptable" and "the program is broken" — and makes every caller wrap every call in `try/catch` to tell them apart.

## Decision

Expected failures are **values**: every domain behaviour, domain service, command handler and query handler returns an `IResult<T>` ([`Result.ts`](../../src/Contexts/@SharedKernel/Domain/DDD/Result.ts)), created with `Result.ok(data)` or `Result.fail(exception)`. A domain exception ([`NoteExceptions.ts`](../../src/Contexts/Notes/Domain/Note/NoteExceptions.ts)) is a plain object describing the broken rule in business words; it is *carried* by `Result.fail()`, never thrown.

`throw` is reserved for programming errors and corrupted state (see [ADR 4](0004-reconstitution-throws-on-corrupted-data.md)). The base `CommandHandler` still catches a throw and converts it into a failed result, so that a bug in one handler cannot crash the process — but that is a safety net, not the way to report a refusal.

Value objects follow the same rule: `NoteTitle.create()` and `Email.create()` return a `Result`. A constructor that throws would force every caller back into `try/catch`.

## Consequences

- Signatures say what can go wrong; the compiler makes the caller look at it (`if (result.isFailure()) return result;`).
- Presenters and controllers map an exception's `type` to an HTTP status without a `catch` ladder.
- The code has one extra line per call. That line is the point.
- `IResult<T>` (the union type) is what you write in signatures; `Result` (the class) is what you call to build one.

## When to revisit

If the project adopted a language-level effect or `Either` library, this type would be replaced by it, not by exceptions.
