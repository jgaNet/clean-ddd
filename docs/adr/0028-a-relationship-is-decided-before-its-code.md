# 28. A relationship between two contexts is decided before its code, and says so

## Context

CTX-MAP-DECLARED holds the context map to the code both ways: a link in the code the map does not declare is refused, and so is a declared relationship nothing in the code carries ([ADR 19](0019-the-domain-is-data.md)). Its own words also say that a new relationship is "a decision written down before it is merged" — and the flow of [RFC 0001](../rfc/0001-architecture-aware-multi-agent-flow.md) goes further: the relationship is declared in the contract stage, before the slices that carry it are written, because the feature mode forbids a feature agent to touch `conventions/`.

The two could not both hold. Preparing phase 2 of the flow on a created project, the person declared Accounts → Notes in the map, as the architecture task before the feature that shares a note with an account; the project's own check refused it at once — *declares Accounts → Notes over an owned-port, which nothing in the TypeScript code carries* — and the gate refused every feature from that base. The declaration could not come first, and the agent could not write it afterwards. The only way through was the one the rule exists to prevent: write the coupling, then declare it.

The storms met the same question earlier and answered it ([ADR 22](0022-the-storm-is-facilitated-and-the-code-is-held-to-it.md)): a storm is `done: false` until the code carries it, and the check holds it either way.

## Decision

**A relationship decided before its code is declared `planned: true`.** The check does not ask the code to carry a planned relationship yet; once the code does, it is held like any other — the same pair, the same mechanism, its contracts read from the code. Every other half of the rule is unchanged: a link in the code that the map does not declare is refused, planned or not, so `planned` can never cover a coupling nobody decided. The rendered map says *planned: not carried yet* where the contracts would be.

The flag may stay once the code carries the relationship: it records how the relationship came in, and removing it is an architecture task like any other edit of the map, never something a feature has to do.

## Consequences

- The contract stage of a cross-context feature can be committed on its own and pass the gate: the relationship planned, the integration contract or the port written, the storm and the plans validated, and the feature's slices then carry it.
- A planned relationship nothing ever carries is visible in the map as such, rather than failing the build; whether to drop it is a person's call, made where the map is read.
- One implementation for every language: CTX-MAP-DECLARED is held by the root tooling, against the tree in TypeScript and against the inventory's links elsewhere.

## When to revisit

If planned relationships accumulated that nothing carries, the check could age them — refuse one planned longer than some number of commits — but nothing yet says one would.
