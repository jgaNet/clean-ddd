# RFC 0002 — Architecture profiles: a Lite profile beside Full, held by one engine

**Status:** proposed. Discovery and storm; four hot spots decided by the maintainer on 6 November (below), the
others still open with the facilitator's recommendation. Nothing is implemented, and the Full profile is not touched.

**Decided (the maintainer, 6 November):**

- **H1, the floor: the large one** (§5, H1, option A). Two of its lines are not mechanical today: identity born
  once, and who reaches a command held at the transport. They are gaps to close in both profiles, not assumptions.
- **H5, granularity: per context.** Each context declares its profile, guided by its subdomain's kind in
  `domain.yaml`. A migration is per context, with an ADR.
- **H8, the cost threshold: Lite is "not supported" unless its median cost per delivered feature is at most 0.6×
  Full's, with no overlap of ranges.** It must also keep Full's structural passes (O6, O11, O8), and have no more
  triaged FAILEDs or real regressions than Full.
- **H8, the campaign: Lite alone against the historical records.** Three Lite trees on requests 1–50, compared with
  J2–J4's Simple and Full trees. The comparison is weaker, and the record must say how:
  - the machine, the harness and the kit changed between J2–J4 and the Lite run;
  - J2–J4's budgets were not equal across arms after J2;
  - Lite's rules were designed with J2–J5's results in view, and are evaluated on requests 1–50, which those
    results come from.
  
  A cheap mitigation, to decide when the protocol is registered: rerun one Simple and one Full tree on requests 1–10
  beside the Lite trees, as a calibration of the machine and the harness, not as a comparison.

**Still open, with the facilitator's recommendation:** H2 (which mechanisms Lite drops), H3 (the trigger table
chooses, the agent proposes), H4 (each held rule names its check), H6 (Lite → Full per context, neither move
assumed reversible), H7 (`strategy` calibrated again for Lite).
**Origin:** [ADR 31](../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) put "a
lighter profile" on the agenda: ports only at the edges, without the full tactical pattern, measured as its own arm,
declared in the contract under its own name if kept, "never a set of rules quietly skipped". This RFC is that item.
**Question:** can a profile keep what Full is measured to buy (isolation of the domain, boundaries between contexts,
storage changes kept out of the rules, no money defect, a structure that does not drift) while cutting what it is
measured to cost?

## 1. What the records say (discovery)

Facts from the records. Nothing here is inferred.

### What Full costs

| Campaign | Simple | Full | Source |
| --- | --- | --- | --- |
| J2, features 1–10, 3 trees each | $1.07–1.82 a tree | $6.42–8.19 a tree | [pilot record](../evaluations/2026-11-01-openstay-pilot.md) |
| J3, features 11–25 | $3.47–6.84 | $9.65–12.33 | [J3 record](../evaluations/2026-11-02-openstay-j3.md) |
| J4, features 26–50 | $12.16–17.39 | $26.84–44.85 | [J4 record](../evaluations/2026-11-03-openstay-j4.md) |
| J5 (running), 13 features delivered in both arms | median $0.26 a feature, 5 source files, 168 source lines | median $0.78, 21 source files, 583 source lines | J5's logs, 6 November |

- **Where Full's 21 files a feature go** (J5, clean-1 and clean-3, non-spec files per delivered feature):
  - domain 4.9–7.2;
  - infrastructure 2.8–4.4;
  - ADR and conventions 3.6;
  - application (non-handler) 0.5–3.6;
  - presentation 2.7–3.2;
  - handlers 2.9–3.3;
  - wiring 1.3–1.5;
  - ports 0.9–1.5;
  - command-event classes 0.8;
  - shared kernel 0.5–0.8.
- **The canonical command.** EditNote in the reference touches 11 hand-written files: 9 production, 2 specs.

### What Full buys

- **Structure (J2–J4).** Parts are kept apart (O6) in every Full tree, against partial or failing in the simple trees.
- **Storage changes.** Request 40, the move to PostgreSQL, touched 0–1 files holding a rule in Full, against about 20 in the simple trees.
- **Money.** No money defect in Full. A simple tree can pay a host twice under two servers.
- **What it does not buy.**
  - Correctness, as the hidden tests see it: no FAILED in either arm in J2–J4.
  - Robustness: the simple trees met the crash and concurrency requirements too.
  - Rules stated once (O1): no better in either arm.
- **The pre-registered hypothesis**, that the simple arm needs larger models faster, is "not supported" at 10, 25 and 50 features.

### Where Full failed (J5, features 51–100, running)

Two of three Full trees stopped on a real failure; one simple tree of three did. Both Full failures are cross-context or transport, not domain:

- **clean-2 at 51.** An anonymous caller was answered `202`, then the operation ended in ERROR, where request 1 says `401`.
  - The older controllers each checked the caller by hand before publishing; the new one copied a controller that did not.
  - In the probe tree, a Full variant where the handler declares its actor and the transport refuses at once, the smallest model delivered 51 at step 0.
- **clean-1 at 64.** Moderation gave the reports of messages and reviews new ids.
  - Each context was right on its own, and the client could not find its report.
  - A probe with a relationship test in the gate made the agent write the test, but with the wrong id. The gate message was then reworded and checked on readers.

### What is mechanical and what is not

From [`conventions/architecture.yaml`](../../conventions/architecture.yaml).

- **Mechanical.**
  - Linter: the dependency table, CTX-CONTRACTS, ARCH-TREES.
  - Check: ARCH-CONTEXT-DECLARED, ARCH-ONE-HANDLER, CTX-MAP-DECLARED, ARCH-ONE-APPLICATION.
  - Types: DOMAIN-RECORDS-EVENTS, QUERY-READ-MODELS.
  - Tests: DOMAIN-RESULT, EVENT-AFTER-COMMIT on the building blocks, CONC-OPTIMISTIC, API-ONE-SURFACE.
- **Review only.** ARCH-MODULES-DATA, ARCH-EXECUTION-CONTEXT, DOMAIN-IDENTITY, DOMAIN-NON-DETERMINISM.
- **Mandatory by no rule.**
  - A command bus.
  - One handler class and one folder per command.
  - `CommandEvent` classes. They are needed in practice, because `Module` is typed on them and the inventory reads `XCommandEvent.set(` ([ADR 20](../adr/0020-the-event-storm-is-read-from-the-code.md)).
  - One file per concept.
  - Aggregates for everything. Only storms require it.
- **The `202` and the operations** are the contract's HTTP grammar. They are held by tests (the scenario, the e2e specs), and copied by `create` with the Tracker.

## 2. The storm: big picture

The storm's subject is the life of an architecture profile, from proposal to evaluation. It is a governance and
tooling process, not an application context, so its stickies are not forced into the storm schema (§9).

**Facts, in order.** Facts marked *(kept)* are durable: they are a file in the repository or a record. The others are steps of a workflow.

1. **ProfileProposed** *(kept: an RFC, this file)*: a maintainer or an architect asks for a profile and says why.
2. **GuaranteesFloorAgreed** *(kept: a section of the ADR)*: the properties no profile may drop are named, each with the rule and the check that holds it.
3. **MechanismsClassified** *(kept: the profile's data)*: each mechanism of Full is required, conditional (with its trigger), or not used in the profile.
4. **ProfileDeclared** *(kept: the contract, plus an ADR, in architecture mode)*: the profile is data in the contract, under its own name.
5. **ProfileValidated** *(kept: a check, in CI)*: the engine proves the profile drops no floor guarantee, and every rule it holds has a check behind it. Full's own checks pass unchanged.
6. **ProjectCreatedWithProfile** *(kept: the binding of the project)*: `create --profile lite|full`.
7. **FeatureStormed** *(kept: a storm, when the profile asks for one)*.
8. **MechanismRequired** *(kept, when it happens: an ADR in the project)*: a feature meets a trigger, for example the first fact another context reacts to, so a conditional mechanism comes in. It is a decision, not a silent addition.
9. **FeatureDelivered** *(kept: a commit that passes the gate)*.
10. **ViolationRefused** *(not kept: the gate's answer)*: the gate refuses a change that crosses a floor guarantee. It is a refusal, not a fact.
11. **ProfileMigrationDecided** *(kept: an ADR)*: a project or a context moves from Lite to Full, or Full to Lite.
12. **CampaignRegistered** *(kept: the kit and the protocol, before any run)*.
13. **CampaignRun** *(kept: logs)*.
14. **ProfileEvaluated** *(kept: a record)*: promote, keep as an experiment, or abandon.

Several starting hypotheses are dropped or merged:
- `FeatureComplexityAssessed` and `FeaturePlanPrepared` are workflow steps: the plan and the strategy's advice, recorded only when they decide something.
- `ArchitectureComplianceVerified` is the gate's answer.
- `BenchmarkResultsCompared` belongs to `ProfileEvaluated`.

## 3. The storm: process level

| Command (intent) | Actor | What decides | Fact | Refusals |
| --- | --- | --- | --- | --- |
| ProposeProfile | maintainer, architect | the maintainer | ProfileProposed | none (a proposal) |
| AgreeGuaranteesFloor | maintainer | the maintainer, on evidence | GuaranteesFloorAgreed | a guarantee with no check behind it is named as such, not dropped |
| ClassifyMechanism | architect | the maintainer | MechanismsClassified | a mechanism a floor guarantee depends on cannot be `not used` |
| DeclareProfile | maintainer (architecture mode) | the contract check | ProfileDeclared | no ADR; a rule reworded per profile (ARCH-ONE-CONTRACT); a floor rule waived |
| CreateProject --profile | developer, orchestrator | `create` | ProjectCreatedWithProfile | unknown profile; a binding without that profile's scaffold |
| RequireMechanism | development agent (proposes), architect (decides) | the profile's trigger table | MechanismRequired | a mechanism outside the profile without a migration |
| DeliverFeature | development agent | the gate, under the project's profile | FeatureDelivered | the gate's steps |
| DecideMigration | architect | the maintainer of the project | ProfileMigrationDecided | a downgrade that drops a guarantee the code relies on |
| RegisterCampaign | benchmark lead | the maintainer | CampaignRegistered | a profile rule changed after registration |
| EvaluateProfile | benchmark lead, maintainer | the pre-registered criteria | ProfileEvaluated | a claim without a record |

**Policies (reactions).**
- When a profile is declared, the engine renders its guide, checklists and import rules from the same data.
- When a feature meets a trigger, the gate refuses until the mechanism is in, or a migration is decided. This is not done silently.
- When a campaign is registered, the profile's data is frozen, by its hash in the protocol.

**Read models.**
- The profile matrix: rule × profile → held, waived (with reason), or conditional (with trigger).
- A project's profile and its mechanism decisions.
- The benchmark scoreboard, with four separate scores.

## 4. Actors and responsibilities

| Actor | Decides | Never decides |
| --- | --- | --- |
| Maintainer of the framework | the floor, the profiles, promotion or abandonment | a benchmark result |
| Architect (of a project) | the project's profile; when a conditional mechanism comes in; migrations | the floor |
| Development agent | how to write a feature inside the profile; it *proposes* a mechanism when a trigger is met | the profile, a waived rule, a migration |
| Orchestrator | one agent or fan-out (`strategy`), worktrees, the order of slices | the contracts between slices |
| Validator (the engine: check, gate, linter) | refuses or passes, mechanically | anything not written as a rule |
| Benchmark lead | the protocol, before any run; the triage, by its written rule | a profile's rules after registration |

## 5. Hot spots

Each hot spot has options and a recommendation. **The maintainer decides.**

### H1 — Which guarantees are the floor?

Proposed floor, each with what holds it today:

| Guarantee | Held by |
| --- | --- |
| Dependencies point inward | ARCH-INWARD, ARCH-TREES (linter) |
| Contexts stay apart | CTX-CONTRACTS (linter), ARCH-CONTEXT-DECLARED (check) |
| Every relationship is declared | CTX-MAP-DECLARED (check) |
| The domain imports no framework | the dependency table (linter) |
| An invariant is enforced where its state lives | DOMAIN-RESULT (tests) |
| A refusal is a value | DOMAIN-RESULT (tests) |
| A write is consistent | CONC-OPTIMISTIC (tests), *where several writers can race* |
| A fact another context reacts to is durable with its state | EVENT-AFTER-COMMIT (tests), *for cross-context facts* |
| Identity is born once | DOMAIN-IDENTITY (**review**, gap) |
| Who reaches a command is said once and held at the transport | **not a rule yet** (the probe's `acceptCommand`) |
| The architecture does not change silently | the two modes (gate) |

- **Option A (recommended).** The table above is the floor, and the two non-mechanical lines are stated as gaps to close in both profiles, not quietly assumed.
- **Option B.** A smaller floor: imports and context isolation only. Cheaper, but it drops what J4 measured Full buying (money, storage locality).

### H2 — Which mechanisms may be optional, and on what trigger?

| Mechanism | Lite (proposed) | Trigger to bring it in | What it would cost to drop it |
| --- | --- | --- | --- |
| Command bus + `CommandEvent` + handler class | not used; a use case is a function of its ports, called by the route | a command answered later (long-running, retried, scheduled) | ARCH-ONE-HANDLER and the inventory must read another shape |
| 202 + operations | not used; commands answer at once (request 1 allows it) | as above | the contract's HTTP grammar becomes a per-profile choice |
| One file per concept, one folder per use case | not used; a file per aggregate and per use-case group | none | none mechanical |
| Aggregate for everything | only where an invariant spans several fields under concurrent writers | a second writer or a cross-field rule | DOMAIN-RECORDS-EVENTS only applies where there are aggregates |
| Domain events | only when something reacts | a reaction | the board shows fewer facts |
| Integration events (shared kernel) | **kept** at context boundaries | a fact another context reacts to | none (floor) |
| Outbox | **kept** for integration events | as above | none (floor) |
| Inbox / idempotent delivery | kept (in the bus) | as above | none |
| CQRS queries port | not used; a query function reads the store and returns a read model | a read that needs another store or a projection | QUERY-READ-MODELS held by the return type only |
| Sagas | not used (not in Full either) | none | none |
| Ports inside a context | not used; ports only at the edges (storage, outside systems, other contexts) | a second implementation | none |
| Module as data (wiring) | **kept**, one file per context, listing routes and use cases | none | the inventory reads it |

Recommendation:
- Lite keeps every boundary mechanism: integration events, outbox, owned ports, the context map and wiring as data.
- Inside a context, Lite drops the per-command ceremony: the bus, the `CommandEvent` class, the handler class, the `202`, and ports inside the context.
- The J5 numbers say the ceremony inside a context is where the 21 files go. The failures were at the boundaries.

### H3 — Who chooses the mechanisms?

- **Option A (recommended).** The profile's trigger table chooses, and the gate holds it.
  - An agent may *propose* a mechanism a trigger calls for.
  - Bringing it in is a `MechanismRequired` decision with an ADR, in architecture mode.
  - The agent never drops one.
- **Option B.** The agent chooses freely within the profile. Cheaper, but it is drift by construction (H4).

### H4 — How is drift kept out?

- Every rule a profile holds names its check. A rule held only by review is listed as a gap in that profile, as Full's four review rules are today.
- The gate runs the project's profile.
- The modes forbid a feature from changing the profile.
- A conditional mechanism brought in without its decision is refused. For example, an integration event without an outbox call:
  - the relationship-test step would see the relationship;
  - a check would see the missing `publishIntegrationEvent`. This is not mechanical today, so it is a gap to close.

### H5 — How do the profiles live together?

- **One contract, one engine.** Profiles are data in `architecture.yaml`: each one holds a set of rule ids, waives others with a reason, sets its HTTP grammar and its checklists. A profile never rewords a rule (ARCH-ONE-CONTRACT).
- **Full stays the default.** Its rendered documents and its gate results must be unchanged, shown by a non-regression test.
- **Profile per context, not per project (recommended, open).** `domain.yaml` already classifies subdomains as core, supporting or generic. A core context may be Full while a supporting one is Lite. This is the DDD reading of "invest where the business is". It makes migration a per-context decision.
- **Contradiction to settle.**
  - The inventory and the storm board read Full's shapes ([ADR 20](../adr/0020-the-event-storm-is-read-from-the-code.md)). Lite's shapes must be readable too, or Lite loses its storms and ARCH-ONE-APPLICATION.
  - The contract's HTTP grammar mandates `202` for commands, so the grammar must become profile-dependent.
- **Languages.** Lite starts in TypeScript only. The other bindings report it as a gap, which is what ARCH-ONE-CONTRACT allows ("what a language cannot hold, it reports as a gap").

### H6 — How does a project change profile?

- **Lite → Full, per context.** It adds mechanisms and keeps guarantees. It is an ADR plus the gate under Full for that context. It is **not cheap**: J4's Pricing split shows a move done well in one tree of three.
- **Full → Lite.** It drops mechanisms the code may rely on, for example a reaction to a domain event. It is allowed only for mechanisms nothing uses, which a check can see.
- **Neither move is assumed reversible.**

### H7 — The orchestrator

- **Splitting by context is unchanged.** It rests on the boundaries, which both profiles keep.
- **Contracts between agents are unchanged.** They are the integration events and ports, which both profiles keep.
- **Worktrees are unchanged.**
- **`strategy`'s calibration** (minutes a sticky, contract stage) was measured on Full. It must be measured again for Lite, so that Lite's advice is not Full's numbers.
- **Validation per slice.** The relationship test, split into an upstream half and a downstream half, lets each slice be checked alone. This is the parallel probe that is planned.

### H8 — How is Lite shown to be worth it?

See §11. In short:
- Lite's rules are frozen before any Lite run.
- The arms get the same requests, hidden tests, ladder, budgets and machine.
- The four scores stay apart.
- A threshold is set in advance, below which Lite is "not supported".
- Lite's design used J2–J5's data, so it is evaluated only on features **none of its rules was tuned on**.

## 6. Invariants, and where the repository contradicts them today

| Proposed invariant | Today |
| --- | --- |
| Full keeps its guarantees | Holds. Full itself has holes the probes showed (the actor, identity across contexts). Closing them changes Full, and is a separate decision. |
| The domain depends on no framework | Holds (linter) |
| A context never touches another's data | Holds for imports (linter). A shared database table is not checked. |
| Invariants stay checkable | Holds where there are specs. Not enforced to exist. |
| A critical mechanism cannot be switched off while a guarantee depends on it | **New**: needs the profile check (§10) |
| A rule declared enforced has a working check | **Contradicted**: 4 rules are `review`, and EVENT-AFTER-COMMIT's "call `publishDomainEvents`" is not mechanical |
| A feature never changes the profile silently | Holds (modes), once the profile is in `conventions/` |
| Contracts between contexts stay explicit | Holds (map, shared kernel) |
| Benchmark results are traceable and reproducible | Partly. Logs and records are kept. Kit amendments during runs happened twice in J5. Triage is now written before the failures it judges ([triage](../evaluations/benchmark/openstay/j5/triage.md)). |
| Lite is never called better without evidence | To hold in the record |

## 7. Context map of the governance

Five areas, each with its own words:

- **Contract**: rules, profiles, the floor.
- **Engine**: check, gate, linter generation, inventory, `create`.
- **Project**: the app, its profile, its mechanism decisions.
- **Orchestration**: strategy, ladder, worktrees.
- **Benchmark**: kits, campaigns, records, triage.

The relationships between them:

- **Contract → Engine** (published language). The engine reads the contract and never adds a rule.
- **Engine → Project** (conformist). A project is held to the engine's checks.
- **Project → Orchestration** (customer and supplier). The orchestrator reads the project's storms and map.
- **Benchmark → everything** (observer). It reads logs and trees and changes nothing in a running arm.

## 8. Proposed ADR (draft, not added to `docs/adr`)

> **Architecture profiles: one contract, one engine, profiles as data.**
>
> *Context.* ADR 31; §1 of RFC 0002.
>
> *Decision (proposed).*
> - The contract names profiles. A profile lists the rules it holds, the rules it waives with a reason, its HTTP grammar and its checklists. No profile may waive a floor rule. No profile rewords a rule.
> - Full is the current contract, unchanged, and the default.
> - Lite is introduced as an **experiment**: TypeScript only, per context, behind the same engine.
> - Lite is promoted, kept as an experiment, or removed by the criteria registered before its campaign.
>
> *Consequences.*
> - One engine to maintain.
> - The inventory and the storm reader learn Lite's shapes.
> - The other bindings report Lite as a gap.
> - Full's documents and gate results are held unchanged by a test.

## 9. The validation contract of a profile

Checks the engine would run, written here as requirements:

- **P1.** Every rule id is held, waived with a reason, or conditional with a trigger, in every profile. No rule is left unlisted.
- **P2.** No floor rule is waived.
- **P3.** A rule a profile holds names an enforcement, and if that enforcement is `review`, the profile lists it as a gap.
- **P4.** A conditional rule's trigger is mechanical: something the inventory or the map can see, such as "the context publishes an integration event" or "the context has a command answered later".
- **P5.** Full's rendered documents and its gate verdict on the reference are byte-identical before and after the profile schema.
- **P6.** A project's binding names its profile, per context. Changing it is an architecture-mode change with an ADR.

## 10. Impact on the bindings and the orchestrator

**Bindings**
- TypeScript gains a Lite section: checklists, scaffold, building blocks (no bus, no Tracker, the outbox kept), and the import table, possibly with fewer layers.
- Rust, Python and Go say "Lite: not held".

**Orchestrator**
- `strategy` takes the profile as an input and has its own calibration.
- The ladder and the gate are unchanged.
- Triage is unchanged.

## 11. Benchmark protocol (proposed, to register before any Lite run)

- **Arms (decided: Lite alone against the records).** Three Lite trees, compared with J2–J4's Simple and Full trees. Same ladder (smallest → strongest), the current harness (resume at the step after the last escalation, triage before FAILED), budgets at least Full's J4 ceilings, so that Lite is never starved where Full was not. The proposal it replaced, three fresh arms run at the same time, stays the stronger design if this one is inconclusive.
- **Requests.** The OpenStay backlog from request 1.
  - Lite cannot start from a Full tree at 50: the conversion would be the experimenter's work, not the arm's.
  - Lite's design used the records of 1–64, so the **evaluation window is features none of its rules was tuned on**. Options are listed in Q4 below.
- **Measures.**
  - Tokens, cost, agent time, lead time.
  - Escalations and real escalations.
  - Lines and files changed.
  - Gate violations refused.
  - Regressions; robustness (chaos suite, concurrent servers); unannounced changes (24, 40, 90).
- **Four scores, kept apart.** Correctness (hidden tests, triaged FAILEDs), robustness, maintainability (the O-rubric, read blind to the arm when possible), change cost.
- **Registration.** Lite's profile data hash, the kit and the criteria are committed before the first Lite run. Any amendment applies to every arm alike, as in J5's triage.

## 12. Implementation plan (after decisions, not before)

1. ADR (accepted or not) on the hot spots' decisions.
2. Profile schema in the contract. Full expressed as a profile. **Non-regression test P5.**
3. The profile check (P1–P4, P6).
4. Lite's data. TypeScript building blocks: a use-case function, the outbox kept, transport answering at once. The inventory and storm reader for Lite's shapes.
5. `create --profile lite`, minimal.
6. Pilot: requests 1–10, one Lite tree beside one tree of each other arm, to check the harness. Not counted.
7. The campaign. Then promotion, keep, or abandon by the registered criteria.

## 13. The hypothesis

> **Clean DDD Lite keeps the isolation and architectural control Full is measured to buy, while it reduces the cost
> of development and of change significantly.**

**Falsified if any of these holds**, with the thresholds to be fixed by the maintainer before registration (Q3):
- Lite's median cost per delivered feature is not below a set fraction of Full's, or its range overlaps Full's.
- Lite loses a structural pass Full holds: parts apart (O6), the storage change in one place (O11), no money defect (O8).
- Lite has more triaged FAILEDs or real regressions than Full.
- Lite's change probes are not cheaper than Full's.

It may well come out that Lite brings no measurable advantage. The protocol must be able to say so.
