# 33. Identity is born once, and a relationship crossed is tested

## Context

A thing made in one context is often taken up by another. In OpenStay, a message reported in Messaging becomes a report that Moderation decides, and so does a reported review. The client was answered an id when it made the report, and it reads the report again by that id, in the other context too.

[ADR 2](0002-identity-is-generated-by-the-domain.md) and DOMAIN-IDENTITY said that every aggregate generates its own identity. Read literally, that tells the receiving side to call `Id.generate()` when it builds its object from the integration event. The thing then exists twice, under two ids, and the client cannot find it where it now lives.

Nothing in a single context's tests sees this, because each side is right on its own. Only a test that makes the thing upstream and reads it downstream, through the API, sees it.

The evidence, from [OpenStay's J5](../evaluations/benchmark/openstay/j5/README.md):

- **Request 64, the moderation queue.** Two of the three Clean DDD trees failed it with every model, in the same way. The queue listed all four reports with the right kind and reason, but the two made in Messaging and Reviews had new ids. `MessageReported` and `ReviewReported` did not carry the report's id, so Moderation gave each one its own. The third tree had stopped at request 51.
- **The same trees on one kit with this decision** (probe p64b: the rule's new wording, the gate step below, and a gate message that names which id to keep) delivered request 64 with the smallest model.
  - With the first wording of the gate message, which said "the id the upstream answered", the same probe found the message's id instead of the report's, at steps 0 and 1, and delivered only with the strongest model.
  - The two Full+ trees then delivered request 64 with the intermediate model.
- **The two-developer probe split the same request by context owner** ([its results](../evaluations/benchmark/openstay/j5/side/two-developers/results.md)). With this decision, the upstream team put the report's id in its events without being asked.

## Decision

- **Identity is born once** (DOMAIN-IDENTITY). A thing first made in one context and taken up by another keeps the id it was born with.
  - The integration event that announces the thing carries that id.
  - The receiving side passes it to its aggregate's factory (`create({ id, … })`) instead of generating a new one.
  - A thing made *about* another one (a report about a message, a notification about a shared note) is a thing of its own, with its own id. That id is the one its event must carry: the report's, not the message's.
- **A relationship crossed is tested.** When a binding turns it on (`relationship_tests`), the gate asks every relationship between two contexts that a change crosses for a test changed with it.
  - A change crosses a relationship when it touches either end: a file of the downstream context that names one of its contracts, or a file of the upstream context that builds one of its integration events. [ADR 35](0035-a-relationship-is-crossed-where-the-change-touches-its-contracts.md) narrowed this to the contracts the change touches.
  - The test is named for the pair (`describe('Notes → Notifications', …)`).
  - It makes the thing upstream through the API and keeps the id that very request answered: its `{ id }`, or its operation's result.
  - It then reads the downstream context through the API and finds the thing by that same id.
- **The gate's message says which id**, in the words above. J5 measured the difference between "the id the upstream answered" and "the id that very request answered, the made thing's".
- **Where it is on.** TypeScript turns the step on. Its reference shows the test in `Notes → Notifications`, the sharing of a note.
  - The step reads TypeScript's names for contracts (`…IntegrationEvent`, `I…` ports).
  - Rust, Python and Go have no such reading yet, and their bindings leave it off.
  - The rule's wording holds in every language, by review.

## Consequences

- An integration event that announces a thing has the thing's id in its payload, and the consumer's factory takes an id.
- A feature that crosses a relationship carries one more test. It is the one that fails first when the two sides disagree on identity, wiring or delivery.
- On its own, the step is a reminder, not a proof: it checks that a test named for the pair changed, not what the test asserts. [ADR 34](0034-a-relationship-test-must-see-the-change.md) adds the executed half, where a binding gives the command: a test that adds a case must fail at the base.

## When to revisit

- **Other languages.** When Rust, Python or Go can name a relationship's contracts in a changed file, its binding turns the step on.
- **The thing does not keep the same id.** If a context must keep an id of its own for a thing it takes up (a legal register, an outside system's key), it keeps both: the born id for the client, its own beside it. The born id stays the one the client finds the thing by.
