# 35. A relationship is crossed where the change touches one of its contracts

## Context

[ADR 33](0033-identity-is-born-once-and-a-relationship-crossed-is-tested.md) made the gate ask for a test, named for the pair, for every relationship between two contexts that a change crosses. It said a change crosses a relationship when it touches either end: a file of the downstream context that names one of its contracts, or a file of the upstream context that builds one of its integration events.

Read at the level of the file, that is wider than the decision meant. A context's wiring file names every contract the context takes part in, and so does a handler that already used a port. A change that touched either file crossed every relationship it names, whatever the change did.

The evidence is from J5's Full+ arm (8 November):

- **Full+ clean-3, request 78 (trader information).** The change added a field to the answer of one port: Listings' `IHosts`, which Accounts answers. It also edited both contexts' wiring files.
  - The gate asked for six relationship tests: Booking, Listings and Payments → Accounts; Moderation, Pricing and Reviews → Listings.
  - The smallest model stopped and said it would not write tests it called contrived. It asked for a choice: real assertions where the field matters, or the step narrowed to the contracts the change touches.
  - Continued, it wrote one file with a describe for each of the six. The gate passed; the step cost $0.46 and about 38 minutes.
- **Replayed on every Full+ delivery so far,** the rule as ADR 33 wrote it and the rule below, on the same diffs, by the same tool:

  | Tree | Deliveries | ADR 33's rule | This rule |
  | --- | --- | --- | --- |
  | clean-1 (requests 64–75) | 12 | 68 relationships | 37 |
  | clean-3 (requests 64–77) | 14 | 106 | 39 |
  | clean-3, request 78 | 1 | 10 | 1 (`Accounts → Listings`) |

  The trees carried a test for nearly every pair the gate asked for: 66 on clean-1, 89 on clean-3. A test written because a step asked for it, about a contract the change did not touch, asserts what the change did not bring.
- **Request 64,** the case ADR 33 was decided on, still asks for `Messaging → Moderation` and `Reviews → Moderation` under the rule below, on both trees.

## Decision

- **A change crosses a relationship when it touches one of the relationship's contracts.** It touches a contract in three ways:
  - **Its own file:** the integration event's class, in the shared kernel; the port's interface, in the downstream context.
  - **A file whose job is the contract,** wherever the change touches it:
    - the upstream file that builds the event;
    - the downstream handler that consumes it;
    - the downstream adapter that answers the port.

    These count as a whole, because the line that matters there may not name the contract. The identity fix of request 64 was `reportId: report.id` inside the event's builder, and `create({ id: event.payload.reportId })` inside its handler.
  - **A mention the change writes or removes,** in a file of either end: a new consumer, a port handed to a handler that did not have it, a wiring line that subscribes a handler. A mention is counted, not a line: the contract's name appears a different number of times before and after the change.
- **A file that names a contract only where the change left it alone does not cross it.** The wiring file that gains a command handler crosses nothing. Neither does a query handler that already used a port and changes for another reason.
- **A port belongs to the context that owns it.** Two contexts may each own a port of the same name (`IHosts` in Booking, Listings and Payments); a file of another context that names it names another thing. A port is crossed only in its downstream context.
- **A test is not the contract.** A unit test's fake that implements a port does not cross the port's relationship.
- **The base is where the change forked from,** as the gate lists the changed files: `merge-base(base, HEAD)`, or `HEAD` for uncommitted work. A file the change adds has no mention at the base.

## Consequences

- The step asks for fewer tests, and each one is about a contract the change touched. On J5's Full+ deliveries it asked for a third to a half as many.
- **A change that keeps every contract as it was asks for no relationship test,** even when it changes what one side does with what crosses. On Full+ clean-3, request 75 (notice preferences) changed whether Notifications owes a notice for a booking or a message, inside its own domain, and asks for none. That behaviour is the request's own end-to-end tests' to hold; the relationship test holds what crosses the boundary: identity, wiring and delivery.
- **The step reads the base.** It runs `git show` for each changed file, which costs one process per file.
- The step still reads TypeScript's names for contracts (`…IntegrationEvent`, `I…`, `implements`, `EventHandler<…>`). The other languages' bindings leave it off, as ADR 33 said.
- [ADR 34](0034-a-relationship-test-must-see-the-change.md) is unchanged: the changed tests named for a pair this rule crosses are the ones it runs at the base.

## When to revisit

- **A relationship crossed that the rule misses:** a change that alters what crosses a pair through a file that neither is the contract's nor names it. Name the file's role in this list, rather than widening the rule back to whole files.
- **Names that do not follow TypeScript's habits:** a port without its `I`, a handler that consumes several events. They are read through the binding when a language turns the step on.
