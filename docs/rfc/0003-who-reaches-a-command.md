# RFC 0003 — Who reaches a command is said once, and the transport refuses at once

**Status:** decided (10 November), in [ADR 39](../adr/0039-a-command-whose-outcome-is-read-later-needs-a-caller-at-the-transport.md): `401` everywhere, the routes whose outcome is read later, the email link an administrator's, held by the scenario and the linter. In the contract as API-CALLER-AT-TRANSPORT and held by TypeScript; Rust, Python and Go report it as a gap. The text below is the proposal as it was.

## 1. The problem

A command is answered `202 { operationId }` and decided later ([ADR 1](../adr/0001-result-instead-of-exceptions.md),
DOMAIN-RESULT). A handler that needs a caller asks `requireSignedIn()`, so an anonymous caller is refused only in the
operation (`ERROR`, `NotAllowed`), after the transport has already said `202`.

Whether that is right depends on who reads it:

- **The reference does exactly this**, and its scenario holds it in four languages.
  - An anonymous `GET /auth/accounts/:id/validate` is answered `202`, then the operation's `ERROR` `NotAllowed`
    (`api/scenario.mjs`, "an anonymous caller may not validate").
  - An anonymous query is refused at once, with `403` ("a new account has no notes; anonymous is refused").
- **An application's product often says otherwise.** OpenStay's request 1 says a request that needs a signed-in
  caller and has none is refused with `401`, at once.

## 2. What J5 measured

From [OpenStay's J5](../evaluations/benchmark/openstay/j5/README.md):

- **J5's clean-2 stopped at request 51.** All three models answered an anonymous `POST /conversations` with `202`, as
  the architecture's grammar says, where request 1 says `401`.
  - The tree's controllers did not agree among themselves: some checked `auth.subjectId` before publishing, others
    did not, and a new controller copied whichever it saw first.
- **Probe p51 delivered request 51 with the smallest model.** It started from that tree, with:
  - one marker on the handler (`static readonly anonymous = true` for a command anyone may ask for, `false` by
    default);
  - one way for a route to ask for a command (`acceptCommand`), which answers `401` at once to a missing caller and
    publishes nothing.
- **Full+ clean-2 carried the same kit and delivered 51 to 60.** It then stopped at 61 on a related seam.
  - The kit's ADR said `acceptCommand` is the one way every controller asks for a command.
  - That pushed the reply of request 60 behind a `202`, and with it the shape of its error. Request 61 then asked for
    a refusal named by the rule (`error: "<NAME>"`), which the tree no longer answered that way.
  - The narrowing is kept in
    [the next campaign's corrections](../evaluations/benchmark/openstay/j5/next-campaign.md): `acceptCommand` for a
    command whose outcome is read later; a command answered at once keeps its own way, and refuses with a `4xx`.

## 3. The proposal

1. **A command needs a signed-in caller by default.** A command anyone may ask for (signing up, a provider's webhook,
   a link in an email) says so once, on its handler.
2. **The transport refuses a missing caller at once,** before anything is published, in the one helper every route
   that publishes a command calls.
3. **The handler still asks for its caller's id,** and the aggregate still decides what that caller may do. This rule
   says who *reaches* the command, not what the caller may do with it.

## 4. Hot spots

- **H1, the status.**
  - (A) `401`, as OpenStay and HTTP say for missing credentials. The reference's anonymous queries, which answer
    `403` today, would move to `401` too, so that one refusal has one status.
  - (B) `403`, as the reference's queries answer today. Only commands move.
  - (C) Leave the status to the application, and say only *when* the refusal happens.
- **H2, the scope.**
  - (A) Every route that publishes a command.
  - (B) Only routes whose outcome is read later (the `202` ones), as J5's correction 2 narrows it. A command
    answered at once keeps its own refusal.
- **H3, the scenario.** The shared scenario's step "an anonymous caller may not validate" changes from `202` + `ERROR`
  to an immediate refusal, in all four languages at once (API-ONE-SURFACE). The link in an email
  (`GET /auth/accounts/:id/validate`) is the case to decide by name: is it a command anyone may follow, or one only an
  administrator reaches?
- **H4, how it is held.**
  - (A) By the scenario only.
  - (B) Also statically where a language can: a route that publishes a command without the helper is refused by the
    linter, as the body schema's value keywords are in TypeScript (ADR 32).

## 5. What changes if it is accepted

- An ADR, and a rule in `conventions/architecture.yaml` under one id.
- Each language:
  - the marker on its command handler;
  - the helper in its presentation building blocks;
  - every route that publishes a command, converted;
  - its guide.
- The scenario: the anonymous validation step, and a new step for an anonymous command on a route that needs a
  caller.
- The created applications: the same helper and marker, from the copied building blocks.

## 6. What stays out

- Roles and permissions: what a signed-in caller may do stays the aggregate's, behind `requireSignedIn()` and its
  rules.
- The shape of an operation's error. The reference already answers `error: { type, message }`, and the scenario
  holds it.
