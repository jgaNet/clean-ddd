# 40. Architecture profiles: one contract, one engine, profiles as data

## Context

[ADR 31](0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) put a lighter profile on the
agenda: ports only at the edges, without the full tactical pattern, measured as its own arm, declared in the contract
under its own name if kept, "never a set of rules quietly skipped". [RFC 0002](../rfc/0002-architecture-profiles-lite-and-full.md)
is that item. Its discovery (§1) is in the records:

- **What Full costs.** In J5, a delivered feature took a median of 21 source files and 583 lines in Full, against 5 and
  168 in the simple arm. Most of the 21 go inside a context: the domain, the handlers, the command-event classes, the
  ports, the wiring.
- **What Full buys.** Parts kept apart in every Full tree (J2–J4), a storage change kept out of the rules (request 40:
  0–1 files holding a rule, against about 20), no money defect. Not correctness as the hidden tests see it, and not
  robustness: the simple trees met both.
- **Where Full failed.** Both of J5's real Full failures were at the boundaries, not inside a context: who reaches a
  command (request 51, [ADR 39](0039-a-command-whose-outcome-is-read-later-needs-a-caller-at-the-transport.md)) and
  identity across contexts (request 64, [ADR 33](0033-identity-is-born-once-and-a-relationship-crossed-is-tested.md)).
- **What is mechanical.** Most rules are held by the linter, the check, the types or a spec. Four are held by review
  alone. Several mechanisms are mandatory by no rule: the command bus, one handler class per command, the
  `CommandEvent` classes, one file per concept.

So the question is whether a profile can keep what Full is measured to buy while cutting what it is measured to cost.
The maintainer decided every hot spot of the RFC on 6, 7 and 8 November.

## Decision

**The contract names profiles, as data, and one engine holds them all.** A profile is a way of holding the contract,
never a second wording of it (ARCH-ONE-CONTRACT).

- **A profile says, for every rule of the contract** (the rows of the dependency table included):
  - the rules it **holds**;
  - the rules it **waives**, each with its reason;
  - the rules it holds **conditionally**, each with a trigger the engine can see in the inventory;
  - its **gaps**: the rules it holds by review alone, named, never presented as guarantees;
  - its **HTTP grammar** and its **checklists**.
- **Full is the contract as written, and the default.** It holds every rule, implicitly (`holds: all`), so a rule
  added later is held by Full without an edit to it. Its gaps are the four review rules of today. Its grammar is the
  contract's `http`, its checklists all of them.
- **The floor (H1: the large one).** No profile may waive these guarantees, each with the rules that hold it today:

  | Guarantee | Held by |
  | --- | --- |
  | Dependencies point inward | ARCH-INWARD, ARCH-TREES |
  | Contexts stay apart | CTX-CONTRACTS, ARCH-CONTEXT-DECLARED |
  | Every relationship between two contexts is declared | CTX-MAP-DECLARED |
  | The domain imports no framework | ARCH-DOMAIN |
  | An invariant is enforced where its state lives, and a refusal is a value | DOMAIN-RESULT |
  | A write is consistent where several writers can race | CONC-OPTIMISTIC |
  | A fact another context reacts to is durable with its state | EVENT-AFTER-COMMIT |
  | Identity is born once | DOMAIN-IDENTITY (**review**: a gap) |
  | Who reaches a command is said once and held at the transport | **no rule yet**: decided by ADR 39, a gap until its rule is in the contract |
  | The architecture does not change silently | the two modes |

  - A floor rule may be held on a trigger where the guarantee itself is conditional: a write races only where several
    writers can, a fact must be durable where another context reacts to it. It is never waived.
  - The two lines that are not mechanical today are gaps to close in every profile, not assumptions.
- **What Lite drops (H2): the ceremony inside a context.**
  - Gone: the command bus, the `CommandEvent` class, the handler class, the `202`, and the ports inside a context. A use
    case is a function of its ports, called by the route, which answers at once.
  - Aggregates and domain events come in only where a trigger asks for them.
  - Everything at the boundaries stays: integration events, the outbox, owned ports, the context map, wiring as data.
- **The trigger table chooses, and the gate holds it (H3, H4).**
  - A trigger is one of a closed set the engine evaluates on the inventory: a context publishes an integration event,
    reacts to one, reacts to its own domain event, has an aggregate two commands write, has a command whose outcome is
    read later, asks another context through a port. The set lives in the engine, so that "where X" is never a rule
    quietly skipped.
  - An agent may propose a mechanism a trigger calls for. It comes in by an ADR, in the architecture mode. The agent
    never drops one.
  - A rule a profile holds by review alone is listed as a gap of that profile.
  - Lite's triggers stay few and objective. The campaign measures how often a Lite feature brings a mechanism in, and
    what the gate refused.
- **Per context, guided by the subdomain's kind (H5).** A binding names the profile of each context
  (`profiles: { <Context>: <profile> }`); a context it does not name is held to the default. The kind of its subdomain
  in `domain.yaml` (core, supporting, generic) guides the choice, and `yarn architecture profiles` shows it beside the
  profile. It does not decide it.
- **A context moves by an ADR (H6).** Lite → Full is per context, with an ADR, and is not cheap. Full → Lite only for
  mechanisms nothing uses. Neither move is assumed reversible. The feature mode refuses a binding change, with the rest
  of `conventions`. The architecture mode reads each changed binding at the base and on disk, and asks for an ADR when a
  context's profile moved.
- **The orchestration is unchanged (H7).** The split by context, the contracts between agents and the worktrees rest on
  the boundaries, which every profile keeps. `strategy` is calibrated again on Lite's own measurements.
- **Lite is an experiment, TypeScript only.** It is promoted, kept as an experiment, or removed by the criteria
  registered before its campaign (H8):
  - three arms at the same time (Simple, Lite, Full) on requests none of them was tuned on, after a calibration all
    three run together ([the draft protocol](../evaluations/benchmark/three-arms/README.md));
  - Lite is "not supported" unless its median cost per delivered feature is at most 0.6× Full's, with no overlap of
    ranges, it keeps Full's structural passes (O6, O11, O8), and it has no more triaged FAILEDs or real regressions than
    Full.
  - The other bindings say "Lite: not held", which ARCH-ONE-CONTRACT allows: what a language cannot hold, it reports as
    a gap.

## Status of the implementation

Steps 1 to 3 of the RFC's plan (§12) are done:

- **This decision.**
- **The schema.** `conventions/architecture.yaml` declares the `floor` and the `profiles`, with Full alone. A binding may
  name a profile per context; none does. The loader reads both.
- **The check.** The conventions check holds the validation contract of RFC 0002, §9:
  - P1, every rule held, waived with a reason, or held on a trigger, once, in every profile;
  - P2, no floor rule waived;
  - P3, a rule held by review alone listed as a gap;
  - P4, a trigger from the engine's closed set;
  - P6, a binding holding a context it declares to a profile the contract declares.

  P5 is a spec: Full's rendered documents are byte-identical with the profiles and without them, and the conventions
  step of the gate passes on the reference ([`profiles.spec.ts`](../../tools/src/profiles.spec.ts)).

Next (§12, steps 4–7): Lite's data, its TypeScript building blocks, the inventory and the storm reader for its shapes,
`create --profile lite`, the pilot, then the campaign.

## Consequences

- **One engine to maintain.** A profile is data the engine reads; nothing is forked.
- **A new rule is a decision for every profile.** Full holds it without an edit. A profile that lists its rules must
  say where it stands, and a rule held by review is a gap in every profile that holds it.
- **The inventory and the storm reader learn Lite's shapes**, or Lite loses its storms and ARCH-ONE-APPLICATION.
- **The HTTP grammar becomes the profile's.** Full's is the contract's `http`, unchanged.
- **The other bindings report Lite as a gap.**
- **Full's documents and its gate verdict are held unchanged by a spec.**

## When to revisit

- **When the campaign is read.** Lite is promoted, kept as an experiment, or removed, by the registered criteria.
- **When ADR 39's rule is in the contract.** It joins the floor's line on who reaches a command, and the line's gap
  closes.
- **When a review rule becomes mechanical.** It leaves every profile's gaps.
