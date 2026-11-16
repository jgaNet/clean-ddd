# Next evolution: evidence-driven architecture (16 November, a review)

**Question.** What is the smallest set of architectural guarantees and explicit software knowledge that lets an AI coding
agent build, maintain and evolve reliable software at an acceptable cost?

**Answer, in one paragraph.** The evidence of five OpenStay campaigns (J2 to J5b, 100 requests, ~$560) and of the K4
pilot run on 16 November (36 runs of the registered pilot, 12 more of A and B running, plus 6 of an amended arm; $1.5) says: the guarantees that paid
are the ones a tool holds at the seams between parts of the system — contexts apart, a storage change kept inside the
adapters, a durable fact where one context reacts to another, one clock, the caller refused at the transport, the API and
the integration events held as data. The structure inside a context (the command bus, a handler class and folder per
command, the 202 and its operation, an aggregate for everything) is what Full costs, 1.5 to 3.7 times Simple, and no
triaged failure of a hundred requests is one it prevented. The knowledge projection as an agent-facing query does not
shorten exploring: K4's criterion 1 holds against it on 12 runs per arm, and an arm told to use the query first explores
as much and costs 7% more. What the knowledge work did produce that pays is declared data held by a check — the rule
register, the published language, the context map's patterns and reasons — which are executable contracts, not a
knowledge layer. **So: evolve primarily toward Lite and executable business contracts, in that order of evidence, and
keep the knowledge query as a cheap existing tool without further investment until a pre-fed, task-shaped variant is
measured in a handoff experiment.** The order of implementation, and the evidence each decision needs, are in §F and §G.

This review supersedes [`2026-11-12-architecture-review.md`](2026-11-12-architecture-review.md) where newer code or
evidence exists; it keeps that review's findings where nothing changed. Nothing here was changed in code, no ADR is
written, no paid experiment was launched for it: the K4 numbers come from a run the maintainer had already ordered.

---

## A. Verified current state

What `main` (d4a2651, 16 November) implements, with the file that holds it. Verified by reading the tree, not earlier
reviews.

### A1. The contract and its enforcement

- **One contract, four languages.** `conventions/architecture.yaml` (739 lines): the dependency table, 35 rules under
  stable ids, the HTTP grammars (`http`, `http-lite`), the two modes, the profiles. Four bindings (`typescript.yaml`,
  `rust.yaml`, `python.yaml`, `go.yaml`, ~172 KB together, three times the contract) name each language's trees, contexts,
  the file that shows each rule, and its gaps.
- **Enforcement, as the contract words it.** `linter`: 10 rules (the table rows, ARCH-INWARD, ARCH-RELATIVE, ARCH-TREES,
  CTX-CONTRACTS, DOMAIN-ONE-CLOCK; API-CALLER-AT-TRANSPORT and API-BODY-SHAPE in the TypeScript binding), generated from the
  table into `typescript/eslint.config.js` (326 lines) and held by 1,365 probes. `check`: 9 rules in `tools/src/check.ts`
  (16 steps: tree shape, rendered documents, links, no `eslint-disable`, probes, context map, storms, one handler,
  inventories equal, migration, published language, API fragments, rule register). `tests`: 6 rules held by the building
  blocks' specs (DOMAIN-RESULT, EVENT-AFTER-COMMIT, CONC-OPTIMISTIC, DOMAIN-CREATE-VS-RECONSTITUTE, API-ONE-SURFACE,
  API-BODY-SHAPE) — a new feature that throws, bypasses the outbox or skips the version check is refused by no tool.
  `review`: 4 rules (ARCH-MODULES-DATA, ARCH-EXECUTION-CONTEXT, DOMAIN-IDENTITY, DOMAIN-NON-DETERMINISM), unchanged since
  the 12 November review (`architecture.yaml:376,435`). `evaluations`: ARCH-LEARNABLE.
- **CI** (`.github/workflows/ci.yml`): the conventions check, the tooling's 254 specs and the flow's 120 tests; per
  language, format, lint, types, unit and end-to-end tests, then `api/scenario.mjs` against the running server. The
  gate (`tools/src/gate.ts`) is the agents' verdict, not a CI step; the modes are "not a CI gate" (`architecture.yaml:104`).

### A2. Profiles

Two profiles, not three (`architecture.yaml:367-490`): **Full** (`default: true`, every rule) and **Lite** (every rule
named, four of them conditional on a trigger the engine reads from the inventory: `reacts-to-domain-event`,
`several-writers`, `publishes-integration-event`; `http-lite` answers every command at once; the command bus, operations,
aggregates, domain events, the queries port and ports inside a context `not_used` until their trigger fires; integration
events, outbox, inbox, owned ports, the context map and the module as data `kept`; use cases call a pure **decision**, ADR
43). The **floor** no profile may drop (`:338-363`): dependencies inward, contexts apart, every relationship declared,
what a context publishes declared once, the domain imports no framework, a refusal is a value, consistency where writers
race, a durable fact where another context reacts, identity born once (held by review), the caller held at the
transport, "the architecture does not change silently" (held by the modes, which no CI runs). "Simple" is the benchmark's
plain arm, not a profile. **Lite is held in TypeScript only** (`rust.yaml:603`, `python.yaml:590`, `go.yaml:622`: "Lite:
not held") and **has never run** (RFC 0002 status; `three-arms/registration.md:3`).

### A3. Executable contracts already in place

- **Integration events as a published language** (ADR 44, `conventions/integration-events.yaml`): 4 events, versioned
  payloads, `announces: {thing, id}`; every language's inventory carries the last version field for field; the gate
  refuses a merged version changed in place. *Implemented since the 12 November review (its I2).*
- **The context map** (`conventions/domain.yaml`): 4 relationships with pattern and reason; the contracts read from the
  code; a link the map does not declare is refused (CTX-MAP-DECLARED).
- **The rule register** (ADR 46, `conventions/rules.yaml`): 24 refusals, each with its public name, context, statement
  and origin (an ADR, a storm, a request); the check holds every refusal to a rule and every rule to a test that names
  it. TypeScript only; the other bindings declare it a gap. *New since the review.*
- **The API as data** (ADR 45): `create` writes `api/1-the-api.yaml` and `tools/src/api.ts` composes it; TypeScript
  only; the reference's own `api/` holds the scenario and a README, no fragments. *Partly done (I1).*
- **One clock** (ADR 42, DOMAIN-ONE-CLOCK): a linter rule in all four languages, from J5b's clean-3 failure at 73.
- **The caller at the transport** (ADR 39, RFC 0003): the linter refuses a route that publishes on the bus or answers
  202 by itself; the scenario checks 401 in every language. From J5's clean-2 failure at 51.
- **Identity born once** (ADR 33, DOMAIN-IDENTITY): a rule, a relationship test "where a binding turns the step on"
  (`typescript.yaml:56` only), review elsewhere. From J5's request 64.
- **Inventories** (`docs/inventory/*.json`, `tools/src/inventory.ts`): what each tree says the application is, held
  equal across the four languages (ARCH-ONE-APPLICATION). Entirely derived.
- **Storms held to the code** (ADR 22, `conventions/storms/`, `tools/src/storms.ts`): an expected storm is what a
  session decided; the check refuses a storm marked done the code does not carry.

### A4. Agents, orchestration, evaluation

- **Guides and skills.** Root `CLAUDE.md` 31.1 KB (a 20.8 KB generated rules block), `typescript/CLAUDE.md` 33.5 KB:
  about 16k tokens loaded before an agent's first turn in the reference. Skills `feature` (8.1 KB), `storm` (8.1 KB),
  `migrate` (12.7 KB); the `feature-author` agent (3 KB). A created application's guide is budgeted and every rule it
  states is held or marked `review` (`tools/src/create.spec.ts:188`, RFC 0005 D4) — *done for created apps, not for the
  reference's own guides.*
- **The flow** (`.claude/flow/`, 7,806 lines of scripts and 2,228 of tests, 120 passing): one agent per feature in a
  worktree with the gate as the verdict (`run-feature.mjs`), slices per context with a frozen contract (`run-slices.mjs`),
  the integrator as a driver role (`integrator.mjs`, ADR 38), the ladder of models with hidden-test grading, replay before
  escalation, leak scan, budget, resume and push (`run-ladder.mjs`, `ladder.mjs`, `grade.mjs`, `supervision.mjs`,
  `machine.mjs`, `resume.mjs`), the K4 task runner (`run-task.mjs`, `k4-measures.mjs`, `k4-score.mjs`, `k4-report.mjs`).
  `tools/src/strategy.ts` recommends one agent or a fan-out from phase 4's measures; it "decides nothing".
- **The knowledge query** (K3, `tools/src/knowledge.ts`, 972 lines plus a 153-line spec): one answer per name, over what
  the tooling already loads, every edge derived or declared; `--json`; since 16 November compact by default, `--full` for
  the former rendering (commit 69e91a1 on the session branch, with the K4 pilot's C+ plan).
- **Evaluations.** OpenStay J2, J3, J4, J5, J5b records and kits under `docs/evaluations/benchmark/openstay/`; the
  three-arms protocol and its registration for J6 (`benchmark/three-arms/`, "proposed, not approved"); the K4 pilot's
  registration (`docs/evaluations/knowledge/k4-pilot/`: README, `plan.yaml`, `plan-cplus.yaml`, six tasks with hidden
  tests and ground truths). **No K4 result is in the tree yet**; the records are on the operator's machine
  (`/var/tmp/k4-pilot/out/records`, `out-cplus/records`, `out-cplus-3.2.0/records`) and are reported in §B1 below.

### A5. The 12 November review's proposals, verified

| Proposal | Status on `main` |
| --- | --- |
| I1 API as data in every created application | Partly: TypeScript `create` only; the reference's `api/` has no fragments |
| I2 Integration events as versioned schemas | Done (ADR 44) |
| I3 Relationship tests in every binding | Not done (`typescript.yaml:56` only) |
| I4 Pattern-shaped rules as data (`forbidden_calls`) | Not done |
| I5 Guide budget, every rule checked or `review` | Done for created apps; not for the reference's guides |
| I6 No agent turn on bookkeeping | Partly (`gate --fix`, `waiting` lines); no classification of verdict lines |
| I7 Parallel grading, pipelining | Partly (`gradeWorkers`); no pipelining |
| I8 Lite pilot, then J6 | Registered, not run |
| I9 One Node floor, package names, README order | Mostly not done (`>=22` vs `>=24`; both packages named `clean-ddd`) |
| I10 Created app per language in CI, nightly, artifacts, coverage | Partly (`create.spec.ts` gates Python, Go, Rust apps); no nightly, artifacts or coverage |

---

## B. Critical findings

Ranked by severity; each with its evidence and a confidence. *High* means several campaigns or a registered measure say
it; *medium* one campaign or a few runs; *low* a reading.

### B1. The knowledge query does not shorten an agent's exploring (K4, measured 16 November) — high

The registered pilot (RFC 0006 §8; `docs/evaluations/knowledge/k4-pilot/README.md`) ran its first two rounds today on
OpenStay's clean-3 at request 100, with claude-haiku-5-5, one agent per run, six tasks (an injected defect, a rule
change no request announced, a change across two contexts, an impact prediction, a one-clock refactoring, a handoff of
half-done work), three arms (A: source and text search; B: A plus the guide, the commands and the skills; C: B plus
`clean-ddd knowledge`, described in one sentence of the prompt). 36 runs, 35 successes, none voided for leakage, $1.25.

| Task | A | B | C | C/B | `knowledge` calls in C |
| --- | --- | --- | --- | --- | --- |
| 1 injected defect | 357k, 2/2 | 455k, 2/2 | 572k, 2/2 | 1.26 | 0 |
| 2 rule change | 316k, 2/2 | 349k, 2/2 | 316k, 2/2 | 0.90 | 0 |
| 3 two contexts | 799k, 2/2 | 907k, 2/2 | 1,157k, 2/2 | 1.28 | 2 (one after the last edit) |
| 4 impact | 671k, 2/2 | 846k, 1/2 | 746k, 2/2 | 0.88 | 3 |
| 5 one clock | 2,189k, 2/2 | 1,918k, 2/2 | 1,835k, 2/2 | 0.96 | 0 |
| 6 handoff | 2,085k, 2/2 | 1,605k, 2/2 | 1,137k, 2/2 | 0.71 | 0 |
| all (tokens, mean per run; successes) | 1,070k, 12/12 | 1,013k, 11/12 | 961k, 12/12 | **0.95** | 5 in 3 runs of 12 |

Read with the registered bands (`k4-report.mjs`, 36 of 54 records, "incomplete"):

- **Criterion 1 holds** (the direction is dropped): C's tokens are 95% of B's; "holds" is 90% or more, "does not hold"
  would need 70% or less and below 80% on four tasks of six (it is below 80% on one). C's one extra success is B's run
  of task 4 whose YAML did not parse; read by hand that answer had a recall of 1.
- **Criterion 2 is undecided**: C's impact recalls 1 and 1, B's 0 (the YAML) and 1; C does not exceed B's highest.
- **The cause is visible in the transcripts.** C called the query in 3 runs of 12; before its first edit in 2, both on
  the impact task; on a name the projection knows (`OutsideReviewWindow`) once, after the work was done. The other calls
  asked a word or a file (`review`, `ReviewWindow`, `isPublished`) and were answered "nothing is called that". On the
  tasks of code, C explored as B did: `grep`, `cat`, `sed -n`, an ADR. The variation between two runs of one arm on one
  task is as large as the difference between arms (task 1: C/B 1.77 then 0.88).
- **A, with no guide, no commands and no skills, succeeded on every task** and reached a recall of 1 on the impact task
  at the second run, by text search; its tokens are 6% above B's over the twelve runs.

The maintainer then amended the pilot (`plan-cplus.yaml`): an arm **C+** told to use the query first, on a package whose
answers were made compact after the first C+ run measured the query at 44% of everything it read (three names, 21 KB,
most of it said twice). Six runs, one a task, 6 successes, $0.23:

| Task | C+ tokens | C+/B | query calls (names) | files read before the first edit, B / C / C+ |
| --- | --- | --- | --- | --- |
| 1 | 569k | 1.25 | 3 (7) | 7, 6 / 5, 10 / 8 |
| 2 | 532k | 1.52 | 1 (3) | 4, 5 / 4, 7 / 5 |
| 3 | 1,524k | 1.68 | 2 (6) | 16, 14 / 13, 14 / 12 |
| 4 impact | 520k | **0.62** | 2 (6) | 18, 10 / 16, 11 / 5 |
| 5 | 2,331k | 1.22 | 2 (3) | 16, 17 / 15, 17 / 13 |
| 6 handoff | 1,032k | **0.64** | 2 | 8, 4 / 6, 4 / 11 |
| sum of task means | 6.51M | **1.07** | 12 in 6 of 6 | |

The instruction obtained the behaviour (the query first, in every run, on names it knows) and not the effect: C+ costs 7%
more than B, more than C without the instruction, and is below B only on the two tasks that ask for an inventory before
acting (impact, handoff). On the tasks of code the answers add to the exploring instead of replacing it (the query's
share of what a run read: 45%, 4%, 17%, 43%, 10%, 9%), and the cost that dominates is getting the tests to pass after the
edit — 20 to 40 calls on tasks 3 and 5 in every arm — which no projection touches.

*Limits:* one tree, one model (the smallest), two runs per cell in the registered pilot and one in C+, six tasks. The
third round of A and B is running as this is written (12 runs; records in `out/records`). None of it changes the
reading: the bands were fixed before the first run and the third round cannot move C's cumulative ratio below 90%.

### B2. Full costs 1.5 to 3.7 times Simple on delivery, and no failure of a hundred requests is one the structure inside a context prevented — high

Pilot 3.5–7.7×, J3 1.5–3.6×, J4 1.5–3.7×, J5b 3.7× ($156.03 vs $42.37); the pre-registered hypothesis "the step features
need rises faster in the simple arm" was "not supported" at 10, 25, 50 and 100 requests, and J4 "points the other way".
Every triaged failure of J5 and J5b "was a rule a request set and nothing executable held" (shapes, nulls and states,
identity across contexts, time, the caller); "none was a boundary crossed". The 12 November review's F1: Full's direct
overhead on an attempt that succeeds is about 35–50%; the factor of three comes from what happens after a first failure.

### B3. What paid is held by a tool at a seam — high

Contexts stayed apart in every Clean tree (14 contexts, no import refused, J5b) while every simple tree of J3 had an
import cycle, read other parts' tables and the clock inline. The PostgreSQL move touched 0–1 rule files in the Clean
trees and 19–22 in each simple tree. simple-2 could pay a host twice and passed all 51 hidden files; no Clean tree
failed an item of money. The seams that failed in Clean trees became executable contracts (the published language, one
clock, the caller at the transport, identity born once) and the Full+ arm then delivered the same requests at step 0.
*Mixed:* the outbox and inbox were not needed to pass the crash tests (the plain trees met them too, and the reference's
own relay lost a notice in the pilot); the discipline paid where a fact crosses a context, not inside one.

### B4. Multi-agent orchestration never paid for itself against one agent — high

Phase 4 pilot and campaign: one agent dominated the fan-out in 4 of 4 runs, same quality, sooner, for 68–74% of the cost;
the fan-out's one win is 21% of active time on a six-context feature at 1.74× the cost, from parallelism alone (E2).
J5b's split requests: "safe and paid for nothing measurable" ($6.19 vs $1.93 per request; the estimate recommended one
agent on all 80 requests it was asked). The integrator's evidence is one probe (2/2 with, 0/2 without; RFC 0004 §2 calls
it "a direction, not a result"). The flow is 7,806 lines of scripts, 70% of the size of the whole contract tooling; its
grading, ladder, resume and leak-scan parts are the evaluation infrastructure every campaign needs; its slices and
fan-out are the part the evidence does not support as a default.

### B5. The guides are large and their value is small — medium

16k tokens loaded before the first turn in the reference, 20 KB in a created app. K4's arm A, without any guide, matched
B on success and cost; the 12 November review's F7 marked "part of Full's read cost is its guide" as a hypothesis, and
the literature RFC 0005 cites found context files "no gain for >20% cost". A Lite agent likely reads all 29 rules: the
rules block is rendered from the full contract and nothing filters it by profile (`tools/src/render.ts`; P5 guarantees
Full's documents unchanged, nothing says Lite's are smaller).

### B6. J6 is registered but not ready — high (see §D)

The registration pins `grade.mjs` at a hash that two later commits changed; the simple arm's verdict is cut at 15 minutes
where the clean arm's gate gets 90; three of the six registered scores (chaos, maintainability rubric, Lite's decisions)
have no instrument for the Tally kit; the first score, cost of change, has no computation; the plans do not push and a
lost machine loses everything, as J5 did; the leak scan is path-literal.

### B7. The evidence rests on one author, one model family, one codebase — high, acknowledged

The same author wrote the architecture, the requests, the hidden tests, the storms, the repairs and the records; the
readers were agents not blind to the arm; results are ranges on three trees, one tree in J5b; machine load confounded
J3 and J4; J5's logs were lost. The records say so themselves (`benchmark/README.md:75-81`). This review inherits it.

### B8. Smaller findings — medium to low

- `tools/README.md:90` now carries a K4 result ("44% of what an agent's run read") in the package's documentation — put
  there today with the compact rendering; a result belongs in the pilot's record, not in a tool's README.
- The flow's `--continue` cost over-count returned in J4 (~17%); the K4 runner reports the runner's figure only.
- `DOMAIN-IDENTITY` is a floor guarantee held by review in three languages of four.
- Node floor `>=22` at the root versus `>=24` in `typescript/`; two packages named `clean-ddd` (3.2.0 and 4.0.0).
- Fresh-agent evaluations exist for TypeScript, Rust, Python and Go features, but the "How this guide is tested" section
  is in two guides of five.

---

## C. Minimal architecture proposal

For each mechanism: the failure it prevents, whether that failure was demonstrated, whether something simpler prevents
it, its implementation cost (lines in this repository), its recurring agent cost, and the verdict. "Demonstrated" means
a record shows the failure in an arm without the mechanism, or its absence in the arm with it.

| Mechanism | Failure prevented | Demonstrated? | Simpler alternative? | Implementation cost | Recurring agent cost | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Contexts apart, dependencies inward** (ARCH-INWARD, CTX-CONTRACTS, the table) | Drift: import cycles, reading another part's tables, the clock inline | Yes: every simple tree of J3; none in 14 contexts of clean-3 | A guide alone did not hold it (control arm D read the prose and drifted like P); a linter is the simple form | eslint config 326 lines generated from the table; probes in `check.ts` | None beyond the refusal when it fires | **Mandatory** (the floor) |
| **Ports and adapters at the boundary of a context** (owned ports) | Storage and provider changes spreading | Yes: PostgreSQL move, 0–1 vs 19–22 rule files | No; but ports *inside* a context (queries port, a port per aggregate) showed no measured gain | Part of the table; no rule of its own | A file more per adapter | **Mandatory at the boundary, optional inside** (Lite's split) |
| **Domain / application separation** (ARCH-DOMAIN) | A rule entangled with a framework | Not measured apart; simple trees stated rules inline and later requests met them (J5's "shortcut taken early") | A pure decision function (ADR 43) is the simpler form | Part of the table | Low | **Mandatory as "the domain imports no framework"; optional as layers** |
| **Context map, declared** (CTX-MAP-DECLARED) | An undeclared coupling | Partly: the check refuses one; no campaign measured a coupling made silently | The inventory derives the pairs; the pattern and reason are declared only here | `domain.ts` 565 lines | Read when a relationship is added | **Mandatory** (small, a check) |
| **Published language** (CTX-PUBLISHED-LANGUAGE, ADR 44) | A consumer broken by a payload changed in place; an id the event forgot (J5 request 64) | Yes: request 64 in Full; closed by ADR 33/44 | A test per consumer is weaker (it misses the other languages) | `published-language.ts` 261 lines, a 50-line yaml | Edit a yaml per event version | **Mandatory where a context publishes** (conditional in Lite, kept) |
| **Outbox and idempotent delivery** (EVENT-AFTER-COMMIT) | A fact published before it is durable; a notice sent twice | Mixed: the reference's own relay lost a notice; plain trees passed the chaos tests by storing the notice in the booking's transaction | Yes inside a context: store the reaction in the same transaction; no alternative when another context reacts | Building blocks + specs | None per feature; one adapter per store | **Mandatory where a fact crosses a context, optional inside** (Lite's trigger) |
| **Optimistic concurrency** (CONC-OPTIMISTIC) | Two writers, the second wins blindly | Demonstrated by a reading (simple-2 pays twice), not by a hidden test | A unique constraint or a serializable transaction where it fits | A contract spec per adapter | A version column and a retry | **Mandatory where writers race** (conditional, Lite's `several-writers`) |
| **One clock** (DOMAIN-ONE-CLOCK) | A sweep and a handler on two nows (clean-3, request 73) | Yes, J5b | None simpler than a linter rule | eslint rule; 4 languages | None | **Mandatory** |
| **Caller at the transport** (API-CALLER-AT-TRANSPORT) | 202 to an anonymous caller (clean-2, request 51) | Yes, J5 | The scenario alone finds it late; the linter finds it at the edit | eslint rule + scenario | None | **Mandatory** |
| **API as data + one scenario** (API-ONE-SURFACE, ADR 45) | Shapes and nulls drifting between languages and from the request | Yes: J5's 61 and 80 in both arms | None simpler | `api.ts` 539 lines; `scenario.mjs` | Edit a fragment per route | **Mandatory for a created application; complete in the other languages** |
| **Result, not throw** (DOMAIN-RESULT) | A refusal that crashes instead of answering | Not measured apart; it is what gives a rule a name (the register depends on it) | A typed error union is the same thing | Building blocks | None | **Mandatory** (the floor) |
| **Command bus, 202 and operations, a handler class and folder per command, CommandEvent** | None demonstrated; this is where Full's cost sits (F1; RFC 0005 "the structure inside a context is what costs") | Its absence is Lite's hypothesis, untested | Lite: a use case answered at once | A large share of `create.ts` (1,203 lines) and of the guides | Files per command, bookkeeping turns | **Optional**; J6 decides whether it goes |
| **Aggregates for everything, domain events inside a context** | None demonstrated | Lite's trigger (`several-writers`, `reacts-to-domain-event`) | A plain function and a table | Part of the above | Same | **Optional, by trigger** |
| **Rule register** (DOMAIN-RULE-NAMED, ADR 46) | A refusal nobody tests; a rule nobody can find by name | Not yet measured (K2 came after J5b; K4's tree has none); every J5 failure was a rule "nothing executable held" | A grep finds what exists, not what is missing | `rule-register.ts` 234 lines, a 116-line yaml | One yaml entry per refusal | **Mandatory as a check, with a stronger evidence rule (§D, §F)**; held in one language of four today |
| **Event storming held to the code** (storms, ADR 22) | A feature's model decided late or lost | Not measured apart; J5b storms were not priced in time | A plan file or the request itself | `storm.ts` 1,087 + `storms.ts` 615 lines | Facilitation time per feature | **Optional**: an aid for a person, not a gate for an agent |
| **ADRs and the two modes** | The architecture changing silently | Not measured; the modes are no CI gate | A PR label | `modes.ts` 92 lines | None for a feature | **Keep the decision log; the mode as the gate's question, not a mechanism** |
| **Skills and guides** | A newcomer guessing the shape | Fresh-agent evaluations (qualitative); K4's A arm matched B without any | A shorter guide; the checks | 461 lines of skills, 64 KB of guides | 16k tokens a run | **Optional, budgeted**; filter the rules block by profile |
| **Multi-agent orchestration** (slices, fan-out, integrator) | Two agents on one tree conflicting | The integrator: one probe; the fan-out: lost on cost in 4/4 | One agent, which the strategy already recommends | 7,806 lines | None when not used | **Optional, opt-in by `strategy`**; the ladder, grading, resume and leak scan stay as evaluation infrastructure |

**The Minimal Architecture Contract**, as a proposal (no ADR yet): the floor as written today, less nothing and plus
two things held by a tool — identity born once (a check that an event announcing a thing carries its id and that the
receiving factory takes it) and the rule's evidence (a test that asserts the refusal, not one that names it). Everything
above the floor is a mechanism a trigger brings in, as Lite already words it. This is Lite's definition, held in every
language, with the floor's two review gaps closed. The evidence to adopt it as the default is J6's, and only J6's.

---

## D. J6 readiness

The protocol (`docs/evaluations/benchmark/three-arms/README.md`) and registration (`registration.md`, "proposed, not
approved") are a sound design: three trees per arm, a new application no kit was tuned on, OpenStay 1–10 as an uncounted
calibration, equal budgets and prompts, the split only where the estimate recommends it, hidden tests outside the
agents' trees, replay before escalation, one PostgreSQL per tree. The 120 flow tests pass. It is not ready to run.

| Item | State | Evidence | Smallest fix |
| --- | --- | --- | --- |
| Independent scenarios | PARTIAL | 40 requests, 41 hidden files, written and rehearsed by the operator; the brief names candidate contexts for Lite/Full storms | A second reader signs a sample of the acceptance files; record it |
| Equal information and budgets | PARTIAL | Ladder, budgets, tools, API fragments equal; **the simple arm's verdict is cut at 15 min, the clean gate gets 90** (`run-ladder.mjs:432,447`); CLI version not logged | Use `timeoutMs` in both branches; log `claude --version` in `started` |
| Reproducible execution | PARTIAL | Trees, plans, scripts and `hashes.json` live off-repository (`/home/user/j6`, `/var/lib/cdd-frozen`); plans have no `push:` | Commit `bin/` and the twelve plans; add `push:` to each |
| Three repetitions | READY | `plain-1..3`, `lite-1..3`, `full-1..3` | — |
| Hidden tests | PARTIAL | Leak scan voids only two absolute paths; `ls ../../grade` or a glob escapes it; no permission barrier on the frozen kit | `chmod 700` on the kit and grade dirs; add `*.acceptance.ts` and `.flow/grade` patterns |
| Correctness and robustness metrics | PARTIAL | M2/M3 in `grade.mjs`; **no chaos suite, no reading rubric, no "Lite's decisions" measure for Tally** (scores 4–6 of the registration) | Write and commit them before approval, or strike the scores |
| Cost of change | PARTIAL | Cost, tokens, turns, time per attempt logged; files/contexts touched, diff size, slope: computed nowhere | A `ladder-report.mjs` with frozen definitions, tested, before the run |
| Failure recovery | PARTIAL | One DB per tree, process groups, resume, slots; boot wiring of `resume.mjs` unstated; no `push:`; grader `--cache` not passed by the ladder | Name the boot hook; `push:`; pass `--cache` |
| Statistical limits | PARTIAL | "No overlap of ranges" and "median ≤ 0.6×" with n=3 and no bands; H3's slope undefined | One paragraph of bands and an "undecided" reading, as K4's |
| **Registration hash** | **BLOCKER** | `grade.mjs` pinned at a86139b4…, changed by `6a1a2c6` and `d90df5f` (now 3d72cdd1…) | Re-hash or pin the ladder to a checkout |

**Required validation before launch:** the dry run of the kit on every starting tree and the solved witness (exists,
`dry-run.json`), the three-way symmetry of the verdict timeouts, one resume rehearsal after a kill mid-grading on Tally,
and the report script run on a stand-in log. Estimated cost of the campaign as registered: $200 per tree, nine trees, so
up to $1,800; the calibration $60 per arm.

---

## E. Knowledge research proposal

### E1. What the model is, against what exists

RFC 0006's unit, `Knowledge = (Intent, Rules, Behaviours, Implementation, Evidence, Relationships)`, maps onto the
repository's artifacts as follows. *Intent*: the storm's decisions and a rule's statement (declared; `storms/`,
`rules.yaml`). *Rules*: the refusals by public name with their origin (declared, K2) and the architecture's rules
(declared, the contract). *Behaviours*: commands, queries, policies, what they record and publish (derived, the
inventory). *Implementation*: files and symbols (derived, the bindings and the tree). *Evidence*: the test that names a
refusal, the check that holds a rule (derived). *Relationships*: the context map's pairs, patterns and reasons
(declared) and the links read from the code (derived).

What this gives that static analysis, the conventions, code search, the tests, the ADRs and the existing commands do
not: **the declared parts only** — a rule's one-sentence statement and its origin, an event's version history and the
thing it announces, a relationship's pattern and reason, a storm's decision. Everything derived is already in the
inventory, the storm board and `yarn architecture storm|context|domain|inventory`, or one grep away. The RFC says so
itself (§5–§6: the graph differs from the import graph "only on specific edges"; Q8: text search is the baseline the
experiment must beat). K4 measured the baseline and it was not beaten.

### E2. What K4 settles and what it leaves open

Settled, on one tree and one model: offered as a query the agent calls, the projection is not an exploration tool the
agent reaches for (3 runs of 12), and when told to reach for it the agent does so without exploring less (C+ at 1.07×
B). The two tasks where it paid (impact 0.62, handoff 0.64) are the tasks shaped like an inventory: "what does this touch",
"what is here already". Left open: (a) whether a projection **given** to the agent, shaped by the task's names, rather
than **offered** as a tool, shortens those inventory-shaped tasks; (b) whether the **declared** facts, which a check
holds, reduce the specification failures J5 counted (that is J6's H2, and J6's arms do not receive the register by
decision); (c) whether any of it holds on a tree with a register (clean-3 has none).

### E3. Alternatives to test before any further projection work

1. **The existing inventory as context**: give the agent `docs/inventory/<language>.json` filtered to the contexts the
   request names (no new code; it is derived and held equal).
2. **A symbol index**: `ctags`-style, or the bindings' file-per-concept map, as a one-line-per-symbol list.
3. **A task-shaped projection**: the operator runs `knowledge --json` on the names the request contains and pastes the
   compact answers into the prompt (the C+ data say the compact answer is 4–11 KB a name).
4. **The guide alone, budgeted**: the 12 November I5, applied to the reference, so that B's 16k tokens shrink.

### E4. Falsifiable hypotheses

- **H-K1.** On inventory-shaped tasks (impact, handoff), an agent given alternative 3 reaches the same success with at
  least 20% fewer tokens than B, over three runs per task; on code tasks it is within ±10% of B. *Rejected if* the
  impact and handoff tasks do not reach 20%.
- **H-K2.** Alternative 1 (the inventory as context) gives at least half of H-K1's gain at no tooling cost. *If it does,
  the projection adds nothing worth its 972 lines.*
- **H-K3.** On a tree with a register, a stronger evidence rule (a test that asserts the refusal) lowers the share of
  triaged failures that are "a rule nothing executable held" — measurable in J6 only if one arm carries the register,
  which the current registration excludes; so this waits for a J6 extension or a later campaign.
- **No graph database, embeddings or persistent store** until H-K1 and H-K2 are measured: the data say a 0.5-second,
  read-only projection from the tree was already more than the agent used.

---

## F. The agent handoff experiment

A design, reusing what exists (`run-task.mjs`, `prepare-arm.sh`, `grade.mjs`, the K4 measures), to be registered before
any run.

- **Agent A's work is a J6 tree at a checkpoint** (or clean-3/simple-3 at request 100, as K4 did): a backlog built by an
  agent whose conversations are not given to anyone. The repository is re-created with one commit, as K4's
  `prepare-arm.sh` does, so no history leaks the backlog's path.
- **Agent B's tasks**, five per tree, one of each kind: an incident (a defect injected in a rule, with a user's report
  in product words), a change of an existing business rule (one no request announced), two additional features (one
  inside a context, one across two), and a handoff of half-done work. K4's tasks 1, 2, 3, 6 are the template; task 4
  (impact) stays as the inventory-shaped probe. Each with hidden acceptance tests, a ground truth and a reference
  solution proven failing-then-passing.
- **Three arms**, equal in everything but the context given: (1) *conventional*: source and text search, no guide;
  (2) *tooling*: the guide, `yarn architecture`, the skills as the tree has them; (3) *knowledge retrieval*: arm 2 plus
  the task-shaped projection **in the prompt** (alternative E3.3), built by a script from the names in the task text,
  never by the operator's judgement, from the start commit only. A fourth arm, the inventory as context (E3.2), is the
  cheap control that decides whether the projection is needed at all.
- **Measures** (K4's, unchanged): success, tokens, cost, time, exploring in calls and bytes, files read before the first
  edit, unnecessary files, regressions against the kit; plus **retrieval accuracy**: precision and recall of the files
  the projection named against the files the reference solution touches, and of the rules it named against the ground
  truth's; plus **the cost of the knowledge**: lines of tooling (K3: 972 + 153), seconds per build (0.5 s on clean-3),
  bytes given per task, and the check failures the register adds on a tree that gets one.
- **Repetitions and bands**: three runs per task and arm, two trees (one Full, one Simple) — 5 × 4 × 3 × 2 = 120 runs,
  about $3 at K4's haiku prices, 50 hours of machine; the bands as K4's (holds / does not hold / undecided), written
  before the first run.
- **Leakage**: K4's rules plus the J6 fixes (relative patterns, a permission barrier on the kit), and the projection
  script's inputs logged with each run so a reader can see what was given.

---

## G. Prioritised implementation roadmap

Small, independently reviewable changes, each with its acceptance criterion and test. Ordered by what the evidence
needs next; nothing here changes a rule without an ADR, and none is started by this review.

| # | Change | Acceptance criterion | Test |
| --- | --- | --- | --- |
| 1 | **J6: re-pin the registration** (`grade.mjs` hash), symmetric verdict timeouts, `push:` in the plans, `claude --version` logged, `--cache` passed to the grader | `registration.md` hashes match; `run-ladder.mjs` uses `timeoutMs` in both branches; a plan with `push:` dry-runs | `run-ladder.test.mjs`: a simple-arm verdict longer than 15 min is not sent back |
| 2 | **J6: a report script** (`ladder-report.mjs`) with the cost-of-change definitions: per request cost, tokens, time, `--numstat`, contexts touched, step, the slope | Runs on a stand-in log and prints the registered scores 1–3 | A fixture log → known table |
| 3 | **J6: the missing instruments or their removal**: Tally's chaos files and reading rubric, or scores 4–6 struck; the statistical bands paragraph | The registration names an instrument for every score it keeps | `kit-check` on the chaos files |
| 4 | **J6: the leak scan takes relative patterns and the kit is unreadable by the agent's user** | An attempt that runs `find / -name '*.acceptance.ts'` is void | `ladder.test.mjs` |
| 5 | **K4's record into the tree**: the 54 records, the C+ records apart, `k4-report.mjs --md`, and this reading; remove the result sentence from `tools/README.md:90` | The pilot's directory holds its outcome as the protocol requires | `k4-report.test.mjs` |
| 6 | **Rule evidence, stronger**: DOMAIN-RULE-NAMED's test must assert the refusal (an `expect(...).toBe/ toEqual` naming the exception on a failed Result), not merely name it; a contract change with its ADR | A test that names a refusal in a comment no longer counts | `rule-register.spec.ts` |
| 7 | **The guide filtered by profile and budgeted in the reference**: the rules block rendered for the context's profile; the reference's guides under the created app's budget | A Lite tree's `CLAUDE.md` lists only the rules its profile holds; root `CLAUDE.md` under the budget | `render.spec.ts`, `create.spec.ts` |
| 8 | **API as data completed** (I1): fragments for the reference and for Rust, Python, Go `create`; **relationship tests in every binding** (I3) | The scenario is composed from fragments in every language; `relationship_tests` present in four bindings | CI's scenario job |
| 9 | **DOMAIN-IDENTITY from review to check**: an event that `announces` a thing carries its id and the consuming factory takes it (the inventory knows both) | The check refuses a consumer that generates an id for an announced thing | `published-language.spec.ts` |
| 10 | **Lite held in Rust, Python, Go** — only after J6 says Lite pays | `profiles_held.lite` in the three bindings; `create --profile lite` gates in each | `create.spec.ts` |
| 11 | **The handoff experiment registered** (§F): tasks, ground truths, the projection script, the bands | Registration committed before any run | `run-task.test.mjs` on the new plan |
| 12 | **The flow's default documented as one agent**; slices and fan-out kept as opt-in; nothing removed until a campaign needs the space | README says which parts are evaluation infrastructure and which are opt-in | — |

---

## H. Stop conditions

Written now, so that a later reading cannot move them.

- **Lite is rejected** if, in J6 as registered (RFC 0002 H8): its median cost per delivered feature is above 0.6× Full's
  or the ranges overlap; or it fails an item of the boundary scores (O6, O11, O8) that Full passes; or it has more
  triaged failures than Full over the 40 requests. If Lite is rejected, Full stays the default and the roadmap's 7, 10
  are dropped; 6, 8, 9 stay, since they are seams.
- **Full as the default is rejected** (in favour of Lite) if Lite meets H8 and J6's H1 and H2 do not count against it.
  "Undecided" (ranges that touch, n=3) extends J6 to five trees per arm before any decision, as the protocol's hot spot
  allows.
- **The knowledge query as an agent's exploration tool is rejected now**: K4's criterion 1 holds on the registered bands,
  and the amended arm did not reverse it. `clean-ddd knowledge` stays as a cheap existing command (it costs nothing to
  keep), with no further investment: no graph, no store, no embeddings, no extension to simple-3.
- **The task-shaped projection (E3.3) is rejected** if the handoff experiment finds H-K1 false, or if H-K2 is true (the
  inventory alone gives half the gain). Then the knowledge direction reduces to the declared data the checks already
  hold.
- **The rule register is rejected as a mandatory mechanism** if a campaign with and without it shows no fewer
  "nothing executable held" failures with it; until measured, it stays as a check that costs one yaml line per refusal.
- **Multi-agent orchestration is rejected as a default** already (B4); it is removed from the tooling only if two
  further campaigns never invoke `strategy`'s fan-out recommendation.

---

## Recommendation

**Order of evolution:** (1) executable business contracts, because every failure the campaigns triaged was a rule
nothing executable held, and the mechanisms that closed them are small checks and linter rules; (2) Lite, through J6
once its blockers are fixed, because the structure inside a context is where Full's cost sits and no failure argues for
it; (3) knowledge-oriented tooling last and only in the task-shaped, pre-fed form, because K4 shows the query form
neither used nor useful for code changes, and useful only where a task asks for an inventory.

**Evidence required before each decision:** before adopting Lite as the default, J6 complete with the bands of §D and
§H; before any further knowledge tooling, the handoff experiment of §F with H-K1 and H-K2; before removing any flow
part, two campaigns that never fan out. Before all of it, the J6 registration re-pinned and its instruments written —
the cheapest and most decisive step this repository can take next.
