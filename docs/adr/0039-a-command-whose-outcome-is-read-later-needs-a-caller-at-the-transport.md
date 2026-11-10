# 39. A command whose outcome is read later needs a signed-in caller, and the transport refuses a missing one at once with 401

## Context

[RFC 0003](../rfc/0003-who-reaches-a-command.md) asked who reaches a command. In J5, clean-2 stopped at request 51
on it:
- the request says a request that needs a signed-in caller and has none is `401` (request 1);
- the tree answered `202` and refused the anonymous caller inside the operation, as the reference's grammar then
  said.

Full+ moved the refusal to the transport, in the tree.

The next failure narrowed the rule. In Full+ clean-2, at request 60, `acceptCommand` had become the one way to ask for
a command, and it pushed a reply that is answered at once behind a `202`. Correction 2 of J5's
[`next-campaign.md`](../evaluations/benchmark/openstay/j5/next-campaign.md) narrowed the refusal to the commands whose
outcome is read later.

The maintainer decided the RFC's four hot spots on 10 November.

## Decision

- **H1, the status: `401` everywhere.**
  - A command or a query that needs a signed-in caller and has none is refused with `401`, as HTTP says for missing
    credentials and OpenStay's request 1 says.
  - The reference's anonymous queries, which answer `403` today, move to `401` too: one refusal has one status.
  - `403` stays for a signed-in caller the rule refuses.
- **H2, the scope: the routes whose outcome is read later.**
  - A command answered with `202`, whose operation is read later, needs a signed-in caller by default.
  - The transport refuses a missing one at once, before anything is published, in the helper those routes call.
  - A command anyone may ask for (signing up, a provider's webhook) says so once, on its handler.
  - A command answered at once keeps its own refusal, a `4xx` as request 1 says.
- **H3, the link in an email: an administrator's.** `GET /auth/accounts/:id/validate` stays a command only an
  administrator reaches. An anonymous caller is refused at once with `401`, no longer with `202` then `ERROR`. The shared
  scenario's step changes in all four languages at once (API-ONE-SURFACE).
- **H4, how it is held: by the scenario, and by the linter where a language can.** The shared scenario holds the
  refusal from outside, in every language. Where a language's linter can see it (TypeScript first), a route that
  publishes a command without the helper is refused, as the body schema's value keywords are ([ADR
  32](0032-a-command-body-is-refused-for-its-shape-only.md)).
- **What stays as it was:**
  - the handler still asks for its caller's id;
  - the aggregate still decides what that caller may do;
  - this rule says who reaches a command, not what the caller may do with it.

## Status of the implementation

- **Decided, not yet in the reference.** By [ADR 37](0037-a-decision-for-every-feature-is-taken-once.md), a decision
  taken late is applied to the code already written. That migration is the next change of the reference. It brings:
  - a rule under one id in `conventions/architecture.yaml`;
  - the marker on the anonymous command handlers;
  - the helper in each language's presentation building blocks, and every `202` route converted;
  - `401` for the anonymous queries;
  - the scenario's steps;
  - the guides and the TypeScript linter rule.
- OpenStay J5b's clean-3 applies the rule in its own tree from request 50, as Full+ did, recorded as an ADR of that
  tree.

## Consequences

- **A client learns at once that it must sign in.** It no longer polls an operation that was never going to succeed.
- **Every language changes its answers at once.** The scenario is the contract between them.
- **A route answered at once is not forced behind a `202`** to get the refusal (J5's request 60).
- **A client that relied on `403` for an anonymous query sees `401`.**

## When to revisit

- When a command answered at once needs the same refusal, and its own `4xx` keeps drifting from request 1's.
