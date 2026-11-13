# 43. A Lite use case calls a pure decision, and says once who may call it, which the transport holds

## Context

Lite ([ADR 40](0040-architecture-profiles-one-contract-one-engine-profiles-as-data.md)) dropped the ceremony inside a
context: a use case is a function of its ports, called by the route, which answers at once. Two things were left
where Full had them by construction, or not at all.

- **Where the rules live.** In Full they live in the aggregate's behaviours, tested without a port. A Lite use case
  validated, decided, wrote and published in one `async` function; its rules were tested through the store's double,
  and nothing kept a port, an `await` or a read of the machine's time out of them. [RFC
  0005](../rfc/0005-what-the-literature-and-j5b-say-before-j6.md) read the literature beside J5 and J5b: every
  triaged failure was about what a request specified, a shape, a meaning or a time, and 71% of the failures in
  *Constraint Decay* are logic errors on a server that starts. Its P1 proposed a *functional core in an imperative
  shell* for Lite: the use case loads, calls a **decision**, saves and publishes; the decision is a pure function of
  the state, the command and the time (ADR 42), where the rules live and are tested with no double. Its H1 is the
  hypothesis J6 measures: Lite's share of logic errors among its failures is below Full's.
- **Who reaches a command.** ADR 39 put it at the transport for Full's `202` routes: a handler says once that anyone
  may ask (`anyoneMayAsk()`), and `acceptCommand()` refuses a missing caller with `401` before anything is published.
  A Lite command is answered at once, and the rule then said "a command answered at once keeps its own 4xx", so each
  Lite use case asked `requireSignedIn()` at its top, by hand. That is the shape J5's request 51 failed on: routes
  that each checked the caller in their own way, and a new one that copied one that did not. The floor's line "who
  reaches a command is said once and held at the transport" (ADR 40) was held by Lite in words only.

The maintainer decided on 13 November (RFC 0005, "Decided"): **D1, yes** — Lite's use cases call a pure decision, in
Lite for J6; and, from the earlier audit of Lite, **a Lite use case declares once who may call it, and the transport
holds it**, as ADR 39 does for Full; CONC-OPTIMISTIC stays conditional on several writers.

## Decision

- **A Lite command decides in a decision.** A command use case loads what it needs through its ports, calls a
  decision, saves the state it answers and publishes its facts. The decision is a pure function of the state, the
  command and the time:
  - it answers the new state and the facts it records, or the rule's refusal as a failed Result (DOMAIN-RESULT);
  - it imports no port, does no I/O, is not `async`, awaits nothing, and reads neither the machine's time nor its
    randomness: the time is its `now` parameter, which the use case takes from the one clock the wiring passes
    (DOMAIN-ONE-CLOCK);
  - a decision that brings a thing into existence is given nothing and generates the thing's id: identity is the
    domain's to generate (DOMAIN-IDENTITY), and it is the one value a decision makes that is not a function of what
    it is given;
  - a fact is a plain value of the context's Domain, recorded only where something reacts to it; the use case turns
    each into the integration event the other context reads, through the outbox (EVENT-AFTER-COMMIT). A Lite context
    has no domain event until its trigger fires, so the decision's facts are not domain events.
- **It is a building block and a file convention.** `Decision<State, Command, Fact, Given>` and `decided(state,
  ...facts)` are in the building blocks' Domain layer
  ([`Domain/Lite/Decision.ts`](../../typescript/src/Architecture/Domain/Lite/Decision.ts)). A context's decisions live
  in its Domain layer, beside the thing they decide, in `<Thing>.decision.ts`, one export per command, named
  `decide<Intent>`. A query reads and has no decision.
- **A Lite use case says once who may call it, and the transport holds it.** The building blocks know no role
  (ARCH-TREES), so the declaration has two words: `signed-in`, the default, and `anyone`, said where the use case is
  defined (`command('SignUp', build, { caller: 'anyone' })`), as Full's `anyoneMayAsk()` marks a handler.
  `answerAtOnce()`, the helper every Lite route answers through, refuses a missing caller of a `signed-in` use case
  with `401 { type: 'NotAllowed', message }` before the use case runs: nothing is read, written or published. A
  caller is missing when the transport proved none (no token, or one it did not accept). A role ("administrators
  only") stays the use case's rule, asked through the shared kernel and refused with its own `403`. A use case that
  needs the caller's id reads it with `callerOf(context)`; `requireSignedIn()` is no longer written in a Lite use case.
- **API-CALLER-AT-TRANSPORT says it.** The rule covered only the routes answered `202`, and left every command
  answered at once its own 4xx. Its statement now says that a use case of a profile that answers every command at
  once needs a signed-in caller unless its definition says otherwise, refused by the transport's helper before
  anything is published or run; "any other command answered at once" (Full's login) keeps its own 4xx. The change is
  in `conventions/architecture.yaml` alone (ARCH-ONE-CONTRACT), so every language's guide renders the same wording;
  what Full holds is unchanged.
- **No new rule for the decision.** A rule id is for what every profile must say where it stands; a decision is a
  shape of Lite's own, with nothing to say in Full, where the aggregate's behaviour is the decision. So it is a
  mechanism Lite `uses` (`profiles.lite.mechanisms.decision`), which the profile check holds to name a file that shows
  it, and a line of Lite's command checklist; the linter holds the file convention. The engine needs no trigger and no
  rule id for it.
- **CONC-OPTIMISTIC stays conditional on several writers.** A decision that refuses on fresh state is what the retry
  of ADR 25 re-runs; nothing here holds a version where two commands do not write one thing.
- **Lite is TypeScript only** (ADR 40); the other bindings still say "Lite: not held". **Full is unchanged**: no Full
  file changed behaviour, and the reference holds no context to Lite.

## Status of the implementation

- **The building blocks.** `Decision.ts` and its spec (a state, a command, a time, an answer; the same answer twice;
  a refusal that leaves the given state as it was). `UseCase.ts`: `command()` and `query()` take `{ caller }`, a
  built use case carries it, `callerOf()` reads the caller's id. `AnswerAtOnce.ts`: the `401` before the use case
  runs. Their specs show a missing caller refused with no run, a command and a query alike, and an `anyone` use case
  answered without one.
- **The linter** (`typescript/eslint.config.js`, held the way DOMAIN-ONE-CLOCK and API-BODY-SHAPE are), on every
  `*.decision.ts` under `src`:
  - in the Domain layer, the layer's row of the table and any port besides (a `Ports/` directory, an `I<Thing>` file),
    in one group with one message, so a refused import is reported once;
  - an `async` function, an `await`, a `for await`, `Math.random()`, and (already) `new Date()` and `Date.now()`;
  - a decision file in any other layer is refused whole.

  A probe decision importing a port, `async`, and reading `Date.now()` gets exactly three errors, one each.
- **The contract.** API-CALLER-AT-TRANSPORT's statement and remediation; Lite's `why`, its `answered-at-once`
  mechanism and a new `decision` mechanism (`uses`). Lite still names every rule, waives none, and its gaps are
  unchanged.
- **The binding.** Lite's `command`, `query` and `context` checklists say the decision, the caller, `callerOf()` and
  the clock passed by the wiring; `shows.decision` names the building block, its spec and the linter's file.
- **The example and `create`.** The Tasks context the tooling's specs write into a created Lite application
  ([`lite-tasks.spec-helper.ts`](../../tools/src/lite-tasks.spec-helper.ts)) decides in `Task.decision.ts`, with its
  spec, takes the clock, and no longer calls `requireSignedIn()`; its inventory is unchanged ("a signed-in account"
  from the default). The storm reader reads a Lite use case's caller from its declaration (`caller: 'anyone'` says
  anyone, a check of the administrator role alone an administrator, nothing a signed-in account). The guide `create
  --profile lite` writes says the decision and the caller; the building block and the linter are copied with
  `src/Architecture` and `eslint.config.js`.

## Consequences

- **A Lite command's rules can be read and tested without a port**: its spec is a state, a command, a time and an
  answer. J6 can ask whether that lowers the share of logic errors (RFC 0005, H1).
- **A Lite command is one file more than before**, the decision, and a parameter more, the clock. That is the cost P1
  named: one file shape and a check.
- **Who reaches a Lite use case cannot differ from one route to the next**: it is said once, where the use case is
  defined, and held in the one helper. A use case anyone may call is visible by its declaration, and the inventory
  reads it there.
- **Not held mechanically:** that a command use case calls a decision rather than deciding inline, and that a
  decision does not mutate the state it is given. Both are read in review and by the checklist; the decision's spec
  catches the second.
- **Lite's profile data changed**, so the hash registered for J6 is taken after this (RFC 0005, D1).

## When to revisit

- **When J6 is read.** If the share of logic errors in Lite is not below Full's (H1), the decision is cost without a
  measured gain.
- **When the linter can see a use case that decides inline** (a command use case that calls no `decide…`), it becomes
  a check rather than a line of the checklist.
- **When Lite needs a role at the transport** (an administrator's use case refused before it runs): the building
  blocks know no role, so it would come from the shared kernel as a guard the use case declares, not as a third word.
