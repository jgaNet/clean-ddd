# 25. A conflict is retried from a fresh read, three times, then refused

## Context

ADR 8 refuses a stale write: of two writers who read the same version, the first wins and the second gets a `ConcurrencyConflictException` on its operation, and "the client re-reads and decides again". That is the right default for the *rule* — a merge is a product decision, per behaviour — but it hands the client a failure that the handler could almost always resolve itself: re-read the aggregate, re-run the behaviour on what the other writer left, save. Two people archiving and sharing the same note in the same second should not need one of them to retry by hand. An external review asked for the policy to be explicit; the owner chose to make it the handler's.

## Decision

**A command refused by a concurrency conflict is run again by its handler from a fresh read, in a new transaction, up to three attempts; the third conflict is the operation's refusal, and the client decides.**

- **The base handler retries `execute()`** ([`CommandHandler.ts`](../../typescript/src/Architecture/Application/CommandHandler.ts)): when the transaction's result is a failed `Result` whose error is a `ConcurrencyConflictException`, and the attempt is not the last, the handler logs the conflict and runs `execute()` again in a new transaction. `execute()` loads the aggregate, so the second run reads what the first writer wrote and re-decides the rule on it; a refusal the rule gives on that state is returned like any other. Nothing is re-applied blindly: the whole use case runs again, which is why this is safe for any handler and needs nothing from the concrete ones.
- **Three attempts** (`CommandHandler.CONFLICT_ATTEMPTS`): enough to absorb two concurrent writers, few enough that a genuinely contended aggregate surfaces as the conflict it is rather than as latency. A failed attempt rolled its transaction back and dropped its events, as any failed `Result` does (ADR 3).
- **The third conflict reaches the client** on the operation, as before: the policy is bounded, and what to do with a contended aggregate past three attempts is the client's decision, not a loop's.
- **The rule is the contract's** (CONC-OPTIMISTIC, reworded), the same in every language; [`CommandHandler.spec.ts`](../../typescript/src/Architecture/Application/CommandHandler.spec.ts) pins the retry on a conflict, the success on the second attempt, the refusal after the third.

## Consequences

- A command handler must be safe to run twice up to its save: it loads, decides, saves, publishes. Every handler of the reference already is, because the shape is the one the guide teaches; a handler that did something irreversible before saving (sent an email, called a model) would do it twice on a conflict. That is one more reason the non-deterministic step is a port whose value the aggregate validates (ADR 7), and the reason a side effect belongs after the commit, in a reaction.
- The three attempts are sequential and inside the request: a contended aggregate costs up to three reads and writes before answering. The contract spec of a repository still proves the first conflict (ADR 8); the base handler's spec proves what is done with it.
- The Tracker records one operation whatever the number of attempts: the retries are inside `handle()`, not on the bus.

## When to revisit

If a behaviour must be applied to whatever is current rather than to what was read (a counter, a "like"), it still belongs in an event the store applies, not in a retried save. If three is wrong for a particular aggregate, the number becomes a property of the handler, not of the base class.
