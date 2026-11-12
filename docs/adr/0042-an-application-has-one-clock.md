# 42. An application has one clock, passed from the wiring, and nothing else reads the machine's time

## Context

[ADR 7](0007-non-determinism-enters-the-domain-as-a-value.md) made non-determinism enter the domain as a value, and
DOMAIN-NON-DETERMINISM said it of time in five words: "a parameter with a default". The reference wrote it that way in
every language. `Account.authenticate(now = new Date())`, `Notification.create(props, now = new Date())`,
`markRead(actor, at = new Date())`. Their handlers called them without a time. The bus stamped its operations with the
machine's time, and so did an adapter's provenance. The rule was held by review, and the review saw nothing wrong:
each default was the rule.

OpenStay's J5b paid for it. Request 57 gave the application a clock that tests move with `CLOCK_OFFSET_DAYS`, and
clean-3 built one. Request 73 then asked a booking to lapse "at the next sweep" once a contested transfer was past
its `dueBy`, with the days moved by that clock. Every model failed the same line, split or not, and so did the control:
- the Payments context took its now from the tree's clock, and saw the transfer late;
- the lapse sweep, written at request 30 on the reference's model, took the machine's time and saw no deadline
  passed.

Seventeen other files of the Application layer read the machine's time the same way. The tree's own ADR said a
handler takes its clock as a parameter, and nothing held it
([J5b's repairs](../evaluations/benchmark/openstay/j5b/repairs.md), R6). A guide section repaired the tree, and opus
moved the sweep to the clock; seven files still read the machine.

A default that reads the machine is invisible in exactly the case it breaks. The code compiles, the tests pass on the
real date, and one forgotten call decides on another now than the code beside it. Nothing fails until a test moves
the clock.

## Decision

- **An application has one now.** A rule of its own, DOMAIN-ONE-CLOCK, held by the linter:
  - a clock the wiring builds is passed to whatever decides or records a time: a command handler, an event handler,
    a job, an adapter, the bus;
  - that code hands the time to the domain as a parameter;
  - a domain method's time parameter has no default;
  - nothing but the building blocks' system clock reads the machine's time.

  DOMAIN-NON-DETERMINISM keeps identity and the ports, and points at this rule for time.
- **The clock is a building block.** A `Clock` is a function that answers the time, declared in the building blocks'
  Application layer. The system clock, the one place that reads the machine, is in their Infrastructure. A context's
  wiring file passes the system clock; an application that moves time (a demo, a test server, an offset) builds
  another clock in its wiring and passes that one instead. A test passes a fixed clock.
- **The compiler refuses a forgotten time, and the linter refuses a read of the machine.** With no default, a call
  that omits the time does not compile (TypeScript, Rust, Go) or fails its type check (Python, strict). Each language's
  linter refuses a read of the machine's time outside the system clock and the tests:
  - TypeScript: ESLint, `new Date()` and `Date.now()`;
  - Rust, Python and Go: their conventions tool.

  A time parsed from a value (`new Date(string)`) is not a read of the machine and is allowed everywhere.
- **Lite holds it too.** A use case is a function of its ports; the clock is one of them.
- **A library's own use of time is outside the rule.** A token library that checks an expiry against the machine
  (`jose` in TypeScript) decides no business time. Our code that computes an expiry or a deadline takes the clock.

## Status of the implementation

- **The contract** has DOMAIN-ONE-CLOCK, enforcement `linter`, in Full and in Lite's `holds`. DOMAIN-NON-DETERMINISM's
  statement points at it.
- **TypeScript** holds it:
  - the building blocks: `Clock` in `src/Architecture/Application/Clock.ts`, `systemClock` in
    `src/Architecture/Infrastructure/Clock/SystemClock.ts`;
  - the code moved onto the clock: the bus's operations, Login and Account, Notifications' delivery and reading,
    Notes' title suggestions;
  - each wiring passes `systemClock`;
  - ESLint holds it in `eslint.config.js`, in every file of `src` but the system clock and the tests.
- **Rust, Python and Go** hold it the same way: a clock in the building blocks, the defaults removed, the wiring passing
  the system clock, and a scan in each conventions tool.
  - Rust: `rust/tools/conventions/src/one_clock.rs`.
  - Python: `check_one_clock` in `python/tools/conventions.py`.
  - Go: `go/tools/conventions/clock.go`.
  The shared scenario passes against each server, and no inventory changed.
- **An operation keeps the clock of the bus that made it**, so that the base handlers, which have the operation and
  not the clock, stamp `finishedAt` on the same now as `createdAt`.
- **Where the languages differ, to settle together:**
  - **A token's expiry.** All four issue a token on the clock. TypeScript (`jose`) and Python (PyJWT) let the library
    check the expiry against the machine; Rust and Go check it on the clock. With the system clock the four answer
    alike. With a moved clock they do not, and the scenario cannot see it.
  - **Moving the time for the whole application.** Each wiring file names the system clock itself, as TypeScript's
    do, so moving the time means editing each one. One clock built by the composition root and passed to every
    wiring would make it a single change, in every language at once.

## Consequences

- **A rule that depends on a date sees the same date everywhere.** A sweep, a handler and a query agree on whether a
  deadline has passed, whatever moves the clock.
- **A behaviour's time is visible in its signature,** and its tests say which time they decide on.
- **Every constructor that needs a now takes one more argument,** and the wiring passes it. That is the price of
  seeing in the wiring which code depends on time.
- **A created application inherits it.** Its linter refuses the machine's time from its first feature, the moment a
  default would otherwise be copied from the reference.

## When to revisit

- When a language cannot refuse a read of the machine mechanically: it reports the rule as `review` in its binding,
  with the reason.
- When an application needs two nows (a business calendar beside the machine's): that is a port named for what it
  decides (DOMAIN-NON-DETERMINISM), not a second clock.
