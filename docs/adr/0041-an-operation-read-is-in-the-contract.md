# 41. What an operation answers when it is read is in the contract, so a kit or a product can be checked against it

## Context

The contract's HTTP grammar says which verb a use case takes and that a command whose outcome is read later answers
`202` with an operation id. It did not say what the operation looks like when it is read: its statuses, its `result`,
the shape of its `error`. Each language answered the same record because the shared scenario
([`api/scenario.mjs`](../../api/scenario.mjs)) held them to it ([ADR 16](0016-one-api-for-every-language.md)), and the
TypeScript Tracker's projection was the one place it was written down. Nothing outside the reference could ask for it.

OpenStay's J5 and J5b paid for that three times. Each time, a convention was taken early, untested where it was born,
and required by a late request:
- J5, request 80: a refusal answered `503`, a habit since request 26;
- J5b clean-3, request 61: an operation's `error` answered `{ type, message }`, the reference's shape, where the
  request says `"<NAME>"` and request 1 had never said which;
- J5b simple-3, request 73: `payment` read `null` for a lapsed booking, where request 27 says `null` only for a request
  still waiting.

The second is a conflict between the kit and the architecture: the tree did what the reference does, and the kit
wanted something else without saying so where the shape is born. A guide sentence did not fix any of the three
([J5's repairs](../evaluations/benchmark/openstay/j5/repairs.md), [J5b's](../evaluations/benchmark/openstay/j5b/repairs.md));
only a test that refuses the deviation when it is born prevents it.

## Decision

- **The operation is in the contract, as data.** `http.operation` in `conventions/architecture.yaml` says where it is
  read (`GET /tracker/operations/:id`), what each status means (`PENDING`, `SUCCESS`, `ERROR`, and `SENT` for a fact),
  and the record as a JSON Schema (draft-07): its fields, which are always there, that `error` is there exactly when
  the status is `ERROR` and `result` only on `SUCCESS`, and that nothing else is (no payload, no context). It is
  written from what the reference answers today: the shared scenario and the TypeScript Tracker.
- **The reference keeps `{ type, message }`.** An operation's `error` is the rule's exception and its message, in
  every language. The name a client acts on is `error.type`.
- **A kit or a product is checked against it.** A benchmark kit that carries its requests' API as data
  ([the kit standard](../evaluations/benchmark/kit-standard.md)) has its operation compared with the contract's by
  `.claude/flow/kit-check.mjs`, before any run. A kit that wants another shape (OpenStay's `error: "<NAME>"`) decides
  it in its request 1, registers that decision as a convention born there with the field it departs from, and sees
  the conflict printed as decided. A departure decided at any later request, or not decided at all, is refused: the
  kit is fixed before agents are paid to find it.

## Status of the implementation

- **The contract holds it** under `http.operation`, with no rule of its own: the record is part of the one surface
  API-ONE-SURFACE already promises, and the scenario still holds every language to it from outside.
- **The flow holds a kit to it.** `.claude/flow/kit-check.mjs` composes a kit's fragments and compares the operation
  they give with the contract's, field by field: a field the contract does not have, a field of another type, a status
  it does not know. Its spec tests the contract's record against the records the scenario reads.
- **No language changes.** Every language already answers this record; the scenario passes unchanged.

## Consequences

- **A kit's conflict with the architecture is seen before any run,** in the request that decides it, rather than by
  the first tree that meets the late request.
- **The record has two copies to keep together:** the contract's schema and what the languages answer. The scenario
  holds the languages; a change to the record is an architecture change, made in the contract first.
- **A product built on a created application can validate its own API** against the record it inherits.

## When to revisit

- When a language answers a field the record does not have, or a status it does not know: the record changes in the
  contract, with the scenario, in every language at once.
- When a kit's departure is wanted by the reference itself (an `error` that is the rule's name alone), which would be a
  change of every language's projection, decided here first.
