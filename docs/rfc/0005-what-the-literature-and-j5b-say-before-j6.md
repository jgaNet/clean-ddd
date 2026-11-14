# RFC 0005 — What the literature and J5b say before J6: a lighter inside, the specification as data, the change as the score

**Status:** decided (13 November), every decision of §6 taken by the maintainer as the table below says. Implemented
since:
- D1, with the Lite audit's access decision: [ADR 43](../adr/0043-a-lite-use-case-calls-a-pure-decision-and-says-who-may-call-it.md);
- D4: the created guide's budget;
- I6: the gate's fixes;
- I2: [ADR 44](../adr/0044-integration-events-are-a-published-language-declared-once.md), the published language
  (`conventions/integration-events.yaml`), each language's payloads in its inventory, held by the check and frozen by
  the gate (CTX-PUBLISHED-LANGUAGE);
- D2, in TypeScript: [ADR 45](../adr/0045-a-created-application-holds-its-api-as-data.md), a created application's
  `api/`, composed by the tooling, held by its end-to-end client and its check. Rust, Python and Go after J6.

D3 and D5 are the protocol's.

**Decided (the maintainer, 13 November):**

| | Decision | Taken |
| --- | --- | --- |
| D1 | Lite's use cases call a pure decision | **Yes,** in Lite for J6. J6 measures H1 |
| D2 | The API's specification is data in a created application | **Yes, in TypeScript before J6.** Rust, Python and Go after J6 |
| D3 | The arms' agents receive the kit's API fragments | **Yes, in all three arms alike** |
| D4 | The created guide has a budget, and each rule in it is a check or marked `review` | **Yes,** the budget and the marking |
| D5 | Change is J6's first score, with one unannounced change per ten requests and the slope reported | **Yes** |

Taken with them, for J6:
- **Lite, from the earlier audit:**
  - CONC-OPTIMISTIC stays conditional on several writers, as Lite's profile has it;
  - a Lite use case declares once who may call it, and the transport holds it, as ADR 39 does for Full.
- **From the architecture review's P0, before J6:**
  - I2, integration events as versioned schemas with their payloads in the inventory;
  - I6, no agent turn on bookkeeping.

  I3 (relationship tests in every language) waits until after J6, since J6 is in TypeScript.
- **J6's shape:**
  - three trees per arm;
  - the split by context where the estimate recommends it, with features registered above the break-even to measure it
    (next campaign, corrections 12 and 14);
  - the new application's brief, requests and hidden tests drafted by the operator and reviewed by the maintainer, ten
    requests at a time.

## 1. The question

Is there an architecture that would serve agents better than clean-ddd? J6, the
[three-arms campaign](../evaluations/benchmark/three-arms/README.md), compares Simple, Lite and Full. This RFC reads
what has been published since 2025 on architecture and coding agents, sets it beside what J5 and J5b measured, and
proposes what J6 should carry and measure.

## 2. What the literature says

Most of it is recent preprints; the rest is practitioners' writing, which measures nothing. Six findings bear on us.

1. **Explicit architectural constraints cost agents.** *Constraint Decay* (EURECOM, COLM 2026) adds requirements to
   backend tasks one at a time: an architecture, a database, an ORM. Capable models lose about 30 points of assertion
   pass rate on average. Clean Architecture alone costs about 9 points; the database is the costliest constraint
   (14 to 19 points). Agents do better in minimal, explicit frameworks than in convention-heavy ones, and 71% of the
   failures are logic errors on a server that starts.
   [arXiv 2605.06445](https://arxiv.org/html/2605.06445)
2. **Agents produce a modularity of folders.** A study of AI-generated smells names it the *Modular Mirage*: code split
   into files without semantic cohesion. As tasks grow from algorithms to systems, the defects shift towards
   architectural decay. [arXiv 2605.02741](https://arxiv.org/html/2605.02741)
3. **Context files barely help.** ETH Zurich's evaluation of AGENTS.md (ICLR 2026 workshop) found no gain in task
   success, for more than 20% more inference cost. An independent two-agent ablation in 2026 found the same.
   [arXiv 2602.11988](https://arxiv.org/abs/2602.11988), [arXiv 2607.27250](https://arxiv.org/pdf/2607.27250)
4. **Types catch what a compiler can see.** Type-constrained generation halves compilation errors and raises
   functional correctness. The evidence for logic errors is thinner.
   [arXiv 2504.09246](https://arxiv.org/pdf/2504.09246v2.pdf)
5. **Long work on one codebase is where agents fail, and nobody compares architectures there.** The best agents
   resolve about 25% of SWE-EVO's release-sized tasks and about 13% of SWE-Milestone's milestones in sequence. SWE-CI
   judges maintainability by whether the next modifications succeed. None of them varies the architecture.
   [arXiv 2512.18470](https://arxiv.org/abs/2512.18470), [arXiv 2603.13428](https://arxiv.org/html/2603.13428v3),
   [arXiv 2603.03823](https://arxiv.org/html/2603.03823)
6. **The rest is argued, not measured.** Vertical slices, the modular monolith with checked boundaries (Spring
   Modulith, ArchUnit), *functional core, imperative shell* and spec-driven development (GitHub Spec Kit, Kiro) are
   recommended for agents by practitioners. No controlled study was found for any of them.
   [InfoQ, skeleton architecture](https://www.infoq.com/articles/skeleton-architecture),
   [Thoughtworks Radar](https://www.thoughtworks.com/en-cn/radar/techniques/architecture-drift-reduction-with-llms),
   [GitHub Spec Kit](https://github.github.com/spec-kit/)

## 3. What our records say

J5b ran the same requests (51 to 100) on simple-3 and clean-3. On the range both have finished (51 to 81):

| | simple-3 | clean-3 |
| --- | --- | --- |
| Delivered at step 0 | 29 of 31 | 25 of 31 |
| Agents' cost, without the triaged failures | $0.45 a request | $1.49 a request |
| Clean-3 written by one agent | — | $1.01 and 57 minutes a request (simple-3: 55 minutes) |
| Clean-3 written by one agent per context | — | $2.48 and 74 minutes, without its three costliest requests |

- **No failure came from a boundary crossed.** Every triaged failure in J5 and J5b was about what a request specified:
  a shape, a meaning or a time, taken early, untested where it was born, and required by a late request
  ([J5's repairs](../evaluations/benchmark/openstay/j5/repairs.md),
  [J5b's](../evaluations/benchmark/openstay/j5b/repairs.md)):
  - J5's 73: a read that lapsed what it read;
  - J5's 80: a refusal answered `503`;
  - J5's 61 and J5b's 61: an operation's `error` shape;
  - J5's 66: one stored value for what is owed and what was refunded;
  - J5b's 73: `null` for a lapsed booking in simple-3, and the machine's time in clean-3.

  ADR 41, ADR 42 and the [kit standard](../evaluations/benchmark/kit-standard.md) answer most of them.
- **A guide sentence reaches new code only.** Given late, a rule shaped what was written after it, and not what was
  already there ([next campaign](../evaluations/benchmark/openstay/j5/next-campaign.md), the CQS probe). What held was
  the rule made a check (ADR 42).
- **Full writes about 2.5 times the source of Simple, and Simple writes more tests.** On 12 November, with simple-3 at
  request 100 and clean-3 at 81, clean-3 had 46,400 source lines against 18,500, and 32,900 test lines against 45,400.

## 4. Where they agree

- **The structure inside a context is what costs.** *Constraint Decay* puts a price on layers; our records put a factor
  of about two to three on Full's cost per request, with no failure the layers prevented.
- **Boundaries hold when a tool holds them, not when a guide describes them.** That is the Modular Mirage, the AGENTS.md
  results, and our late guide sentences. clean-ddd already makes its boundaries data and checks.
- **The failures that remain are about the specification, not the structure.** 71% logic errors on a server that
  starts, in *Constraint Decay*; every triaged failure of ours. The lever is the specification made checkable.
- **Nobody knows yet whether structure pays later, on change.** That is the one place an architecture is supposed to
  earn its cost, and the one place no study looks. J6 can.

## 5. Proposals

### P1. Lite stays J6's candidate, with its decisions as pure functions

No new arm. Lite (RFC 0002, ADR 40) already drops the ceremony inside a context and keeps every boundary. This proposes
one addition to its shape, from *functional core, imperative shell*:
- a use case loads what it needs, calls a **decision**, saves what the decision answers, and publishes it;
- the decision is a pure function of the state, the command and the time (ADR 42), with no port. It answers the new
  state and its facts, or the rule's refusal.

The decision is where the rules live, testable without a port; the use case is the shell. Full is unchanged.

*Cost:* one file shape in Lite's checklist and building blocks, and a check that a decision imports no port.
*Measured by:* J6's Lite arm against Full's. Lite's share of logic errors among its failures says whether the
decision helped.

### P2. The API's specification is data in the application, in every profile

The kit standard makes a kit's API data, and validates every answer of the hidden tests against it. The application
does not have it: the shape lives in the code's route schemas and read models, where a habit can drift from what the
requests say. This proposes:
- an `api/` directory in a created application, holding JSON Schema for each route's answers by status;
- route schemas and the end-to-end tests read it, so an answer that departs from it fails the application's own tests;
- the shape a request gives is added there first, before the code (R3 of J5b, as a file rather than a sentence).

This is the contract-first part of spec-driven development, held by tests.

*Cost:* the reference's four languages, `create`, and the API-ONE-SURFACE checks gain one data source. ADR 41's
operation becomes one entry of it.
*Open question (D3):* in J6, do the arms' agents receive the kit's API fragments as data, or only the requests' prose?
Giving them is giving the specification, not the tests, and it would close the convention failures in every arm,
Simple included. That changes the experiment, so it is decided before registration, for all three arms alike.

### P3. Guides shrink, and every rule in them is a check or says it is not

The created guide and the reference's guides grow with every repair. The literature finds no gain from context files
for 20% more cost; our records find late sentences reach new code only. This proposes:
- a size budget for the guide `create` writes;
- each rule it states is either held by a check, with its id, or marked `review`, as the contract already marks rules.

*Measured by:* tokens read per request, and failures on rules marked `review`.

### P4. J6's first score is the cost of change

The three-arms protocol lists the cost of change fourth, after correctness, robustness and maintainability. Change is
the one score that can show structure paying for itself, and the one the literature does not measure. This proposes:
- **Change is scored first.** J6 registers its unannounced changes (as OpenStay's 24, 40 and 90 were), at least one
  per checkpoint of ten. Each is scored by its agents' cost, the files and contexts it touched, and whether it was
  delivered at step 0.
- **The slope is reported.** The cost of each request is plotted against its index, per arm. A structure that pays
  shows a flatter slope even where its intercept is higher.

### Not proposed

- **Event sourcing, CQRS with separate stores, microservices:** more structure, with no evidence for agents, and the
  database is the costliest constraint measured.
- **A fourth arm of vertical slices without checked boundaries:** that is Simple, organised by feature. It would teach
  nothing Simple and Lite do not.

## 6. Decisions asked

| | Decision | If yes |
| --- | --- | --- |
| D1 | P1: Lite's use cases call a pure decision | Lite's checklist, building blocks and check; RFC 0002's registered profile hash is taken after |
| D2 | P2: the API's specification is data in a created application | An ADR, `create`, the four languages; ADR 41's operation moves into it |
| D3 | The arms' agents receive the kit's API fragments | One sentence in the three-arms protocol, the same for every arm |
| D4 | P3: the created guide has a budget, and its rules are checks or marked `review` | `create` and the guides; a check on the budget |
| D5 | P4: change is J6's first score, with one unannounced change per ten requests and the slope reported | The three-arms protocol and the kit |

D3 and D5 change the protocol only. D1, D2 and D4 change what an arm is given, so they come before Lite's profile data
and the kit are hashed for registration.

## 7. The hypotheses

Each can be falsified by J6 as registered:
- **H1 (P1):** Lite's share of logic errors among its failures is below Full's.
- **H2 (P2, D3):** with the specification as data, no triaged failure is a convention the specification states.
- **H3 (P4):** Full's slope of cost per request is flatter than Simple's, and its change requests cost less than
  Simple's, even where its features cost more. If not, Full's structure does not pay for itself on this kind of
  application at this size.

It may come out that none of the structure pays within forty requests. The protocol must be able to say so, as RFC
0002 already asks.
