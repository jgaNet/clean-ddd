# Clean DDD: an architecture review, and the smallest set worth keeping (12 November 2026)

A review of the repository at `main` (`fd4a2b0`), with J5b's clean-3 at request 85 and simple-3 finished. It is a
review and a proposal: nothing here is implemented by it. Every claim names its evidence, a file of the repository or
a record. A claim with no evidence is marked **hypothesis**. No benchmark result is invented; where a number is
missing, the review says so.

The question it answers is the maintainer's:

> What is the smallest set of architectural guarantees and agentic coordination mechanisms that measurably improves
> the reliability and maintainability of AI-generated software, without disproportionate development cost?

The short answer is in §F. The review tested each finding of the brief against the repository, and kept what holds.

## A. Executive summary

1. **Full costs 1.5 to 6 times Simple, and pays back in structure, not in delivery.** Every campaign with a plain arm
   delivered as much as the architecture arms. The plain arm was cheaper and sooner every time.
   - What Full measurably bought: locality under a storage change, no import drift, no money defect, and a safe
     fan-out.
   - What it did not buy: correctness as the hidden tests see it, or robustness. The plain trees met the crash and
     concurrency requirements too.
   - Evidence: ADR 31, RFC 0002 §1, the J4 record, J5b.

   *Action:* keep the guarantees that bought something, and drop the ceremony that bought nothing. That is Lite's
   hypothesis, which no run has tested yet.
2. **Every triaged failure was at a specification seam, none at a boundary.** In J5 and J5b, each failure was a rule a
   request set and nothing executable carried: a shape, a meaning, a time, an identity across contexts, or who may call.
   The layers did not prevent any of them. ADR 33, 39, 41 and 42 closed four of them, one at a time.

   *Action:* make the seams executable as a category: the API, integration events, states and nulls as data, held by
   tests. Not more layers.
3. **Contracts between contexts are names, not data.** An integration event is a language type with no schema and no
   version, and the bus is in memory, so nothing serialises it. The inventory, which holds the four languages equal,
   compares the events' names, not their payloads. And the relationship tests that hold identity across contexts
   (ADR 33) are on in TypeScript only.

   *Action:* integration events as versioned schemas, payloads in the inventory, relationship tests in every
   language.
4. **The multi-agent split is safe, and neither faster nor cheaper below its break-even.** In J5b, the split
   requests cost $2.12 against $1.07 and took 65 minutes against 54. The ladder's own estimate recommended one agent
   on every one of them.
   - The strongest lever on cost is not the split: 47 of simple-3's 50 requests and 27 of clean-3's first 33 were
     delivered by the smallest model at step 0. The failures, each triaged, are what is expensive.
   - Correction 12 (split only where the estimate recommends it) and correction 13 (an owner is judged on what it
     can fix alone) are now in the ladder.

   *Action:* one agent by default; measure the split only above its break-even (RFC 0005 P4, next campaign 14).
5. **Every mechanical rule is implemented four times, and the evidence is thin.**
   - *Four times:* ADR 42 (one clock) took four hand-written scans: ESLint, `one_clock.rs`, `check_one_clock`,
     `clock.go`. API-CALLER-AT-TRANSPORT did the same.
   - *Thin evidence:* J5b runs one tree per arm, the kits were tuned on the requests they are graded on, and the
     machine lost a whole campaign once (J5, 10 November).

   *Action:*
   - Pattern-shaped rules become data, read by one generic scanner per language.
   - J6 is registered with at least three trees per arm, a new application, and infrastructure failures classified
     apart from the agents'.

## B. Verified findings

Severity: **high** changes a decision; **medium** costs measurably; **low** is friction. Confidence: **high** when
several records agree, **medium** with one record or a small n, **low** for an inference.

### F1. Full's cost over Simple is large, and most of it comes from failures and splits, not from writing

- **Evidence:**
  - *J2–J4:* Simple cost $1.07–1.82 a tree against Full's $6.42–8.19 (J2), and $12.16–17.39 against $26.84–44.85
    (J4)
    (RFC 0002 §1). The J4 record says Simple was 1.5–3.7 times cheaper.
  - *ADR 31:* the architecture arms took 1.4–2.8 times the time and 3.1–6.0 times the cost, on means.
  - *J5b, requests 51–81:* $26.41 against $101.30. Without the triaged failures, $0.45 against $1.49 a request.
  - *The first attempt alone (step 0, one agent, the smallest model, J5b logs):*

    | | simple-3 | clean-3 |
    | --- | --- | --- |
    | Turns | 44 | 35 |
    | Tokens read from cache | 6.7M | 9.9M |
    | Output tokens | 65k | 90k |
    | Cost | $0.49 | $0.66 |

- **Implication:** Full's direct overhead on an attempt that succeeds is about 35–50%. The factor of three comes from
  what happens after a first failure: an escalation, a split, a triage (clean-3's 61 cost $17.64, its 73 $31.97). This
  reframes the question: the cost of Full is mostly the cost of its failures.
- **Severity:** high. **Confidence:** high on the ranges, medium on the attribution (one tree per arm in J5b).
- **Action:** measure J6 per attempt as well as per request, so that writing, escalation and integration are seen
  apart.

### F2. What Full buys is structure under change, not delivery

- **Evidence:**
  - *Delivery:* no FAILED in either arm in J2–J4 (RFC 0002 §1). The plain arm delivered as much in every experiment
    (ADR 31).
  - *Storage:* the move to PostgreSQL at request 40 touched 0–1 rule files in Full, against about twenty in each
    simple tree (J4 record).
  - *Money:* no money defect in Full; a simple tree could pay a host twice under two servers (J4 reading).
  - *Drift:* zero import refusals in the tooling arm, 0–24 in the prose arm (ADR 31).
  - *Robustness:* the plain trees met the crash and concurrency requirements too (the robustness record, 31 October).
- **Implication:** the guarantees that paid are the boundaries, a storage change kept in the adapters, and the
  money/consistency discipline. The plain trees' robustness says the outbox and inbox are not needed to pass those
  tests; what they protect is shown by the J4 reading, which found a double payout in a simple tree.
- **Severity:** high. **Confidence:** medium. The independent readings had three readers at J4, and the change probes
  are few (24, 40, 90).
- **Action:** make the cost of change J6's first score (RFC 0005 P4, D5).

### F3. The failures are at specification seams, and each was closed one at a time

- **Evidence:**

  | Request | What failed | Closed by |
  | --- | --- | --- |
  | J5's 51 | An anonymous caller was answered `202` | ADR 39 |
  | J5's 64 | A report got a new id in the next context | ADR 33 |
  | J5's 73 | A read lapsed what it read | R1 |
  | J5's 80 | A refusal answered `503` | R2 |
  | J5's 66 | One stored value meant two things | R4 |
  | J5's and J5b's 61 | An operation's `error` shape | ADR 41 |
  | J5b's 73 | `null` in a later state in simple-3 | R5 |
  | J5b's 73 | The machine's time instead of the clock in clean-3 | ADR 42 |

  Sources: J5's and J5b's `repairs.md`, the J5 record.
- **Implication:**
  - These are categories: shapes, nulls and states, identity across contexts, time, the caller.
  - Most were closed by a sentence (R1–R5) or by one rule for one case. A guide sentence given late reaches new code
    only: the CQS probe in `j5/next-campaign.md`, and J5b's R6 replays, where haiku and sonnet failed again with the
    sentence in place.
  - Literature agrees: logic errors dominate agent failures, and context files barely help (RFC 0005 §2).
- **Severity:** high. **Confidence:** high.
- **Action:** close the categories with executable contracts (§C, I1–I3).

### F4. Four guarantees are held by review alone

- **Evidence:** `gaps: [ARCH-MODULES-DATA, ARCH-EXECUTION-CONTEXT, DOMAIN-IDENTITY, DOMAIN-NON-DETERMINISM]` in both
  profiles (`conventions/architecture.yaml`, `profiles`). ADR 42 has since made time mechanical in all four languages
  (DOMAIN-ONE-CLOCK).
- **Implication:** DOMAIN-IDENTITY failed in J5 (clean-1 at 64). Its mechanical half, the relationship tests, is on in
  the TypeScript binding (`relationship_tests` in `conventions/typescript.yaml`, also copied into a created
  application) and in no other binding (`rust.yaml`, `python.yaml`, `go.yaml` have none).
- **Severity:** high for DOMAIN-IDENTITY; low for the other two, which no record saw fail.
- **Confidence:** high.
- **Action:** relationship tests in every binding (I3). The other two stay in review until a failure shows them.

### F5. Contracts between contexts are not data

- **Evidence:**
  - *No schema:* integration events are classes typed by their payload, with no schema and no version
    (`typescript/src/SharedKernel/Application/IntegrationEvents/NoteIntegrationEvents.ts`). The comment says the event
    "evolves with care", which is prose.
  - *Names only:* the inventory holds `links[].contracts` as names (`docs/inventory/typescript.json`: `"contracts":
    ["NoteShared"]`), so ARCH-ONE-APPLICATION compares names, not fields.
  - *No serialisation:* the reference's bus is in memory (`InMemoryEventBus.ts`), so a payload is never serialised
    between contexts.
- **Implication:**
  - A payload field added, renamed or retyped in one language passes every check, unless the shared scenario happens
    to read it.
  - Contract evolution (a second version of an event, or a consumer not yet moved) is not representable.
  - The identity a creation event must carry (ADR 33) is not visible to any check.
- **Severity:** high for a reference whose claim is "the contract between contexts must be a visible, versionable
  file" (CTX-CONTRACTS's `why`). **Confidence:** high.
- **Action:** integration events as versioned schemas, payloads in the inventory (I2).

### F6. The tooling still spends agent turns on its own bookkeeping

- **Evidence:**
  - *ADR 31:* "much of what the tooling caught was its own bookkeeping: a storm not marked done, a document to
    regenerate, a context missing from the map."
  - *J5b's owner verdicts:* 19 of 30 failed, mostly because the other owner had not written its part yet
    (`j5/next-campaign.md`, corrections 12–14).
  - *Since then:* the gate's `--fix` marks storms done and renders the documents in the clean arm's verdict
    (`run-ladder.mjs`, `cleanSteps`). Correction 13 filters out what waits on another owner.
- **Implication:** partly fixed. No record measures the turns still spent on bookkeeping.
- **Severity:** medium. **Confidence:** medium.
- **Action:** measure it, by classifying each verdict line the ladder sends back; then generate whatever is generated
  rather than asking for it (I6).

### F7. The guides are large, and their measured value is small

- **Evidence:**
  - *The reference:* the root `CLAUDE.md` is 27.7 KB and `typescript/CLAUDE.md` 32.7 KB; the root `README.md` is
    86.9 KB.
  - *The J5b trees:* clean-3's guide is 19.9 KB, simple-3's 2.8 KB. clean-3 reads about 3.2M more cache tokens per
    first attempt (F1).
  - *Literature:* context files bring no gain in success for over 20% more inference cost (ETH, ICLR 2026 workshop;
    RFC 0005 §2).
  - *Our records:* rules that held were checks (ADR 39, 42), not sentences (F3).
- **Implication (hypothesis):** part of Full's read cost is its guide.
- **Severity:** medium. **Confidence:** medium. The size difference is measured; its share of cost is not.
- **Action:** a budget for the created guide, and every rule stated in it either checked or marked `review`
  (RFC 0005 P3, I5).

### F8. The split by context is safe and slower below its break-even; the dynamic choice exists

- **Evidence:**
  - *J5b's split requests:* $2.12 and 65 minutes, against $1.07 and 54 for one agent (`j5/next-campaign.md`).
  - *The estimate:* `clean-ddd strategy` recommended one agent on all seven split requests, with 4 to 7 stickies under a
    break-even of 7.4 to 9.8.
  - *Safety:* the integrator's gate passed every merged result within one to three rounds. The two split requests that
    failed their hidden tests (61, 73) failed on a shape and on the clock (F3), not on the merge.
  - *Earlier:* a naive split lost three features to conflicts; the fan-out with a frozen contract lost none, and was
    21% sooner on a six-context feature (ADR 31).
  - *Since J5b:* correction 12 makes the estimate decide (`fanOut.split: recommended`).
- **Implication:**
  - The orchestrator can choose a strategy by feature, and now does, on stickies, contexts and links from the storm.
  - That rule is calibrated on few runs, and nothing has measured it above its break-even.
- **Severity:** medium. **Confidence:** medium.
- **Action:** Experiment A registers features above the break-even, split and not (next campaign 14).

### F9. Escalation by model works, and its cost is the failures

- **Evidence:**
  - *At step 0, the smallest model:* 47 of 50 requests in simple-3 and 27 of 33 in clean-3 (J5b logs).
  - *The ladder:* haiku, then sonnet, then opus, then a control by one opus agent, then triage (`run-ladder.mjs`).
  - *Replay before counting:* a failure is replayed alone before it counts (`replayed`, `verdict-replayed`), and an
    earlier failure is graded on the starting commit when the plan asks for it (`regressionCheck`).
  - *What failures cost:* the triaged ones were $13–32 a request (F1), against about $1 for a delivered one.
- **Implication:**
  - Starting at the smallest model is right on this evidence.
  - What remains expensive is a failure that every step repeats because none of them was told what the rule is, which
    is F3 again.
- **Severity:** medium. **Confidence:** high.
- **Action:** none on the ladder. The lever is F3.

### F10. Multi-language maintenance: the rule text and the import tables are single-sourced, the semantic checks are not

- **Evidence:**
  - *Single-sourced:*
    - the rules, their text and their ids (`conventions/architecture.yaml`);
    - the import tables: ESLint generated from the table, Rust's crate graph compared with it, Python's and Go's
      tools reading it;
    - the documents, rendered by `yarn conventions:write`;
    - one HTTP scenario run against every server in CI (`.github/workflows/ci.yml`, `api/scenario.mjs`);
    - the inventories, held equal (ARCH-ONE-APPLICATION).
  - *Hand-written per language:*
    - DOMAIN-ONE-CLOCK: `eslint.config.js`, `rust/tools/conventions/src/one_clock.rs`, `python/tools/conventions.py`,
      `go/tools/conventions/clock.go`;
    - API-CALLER-AT-TRANSPORT: `caller_at_transport.rs`, `caller.go`, the Python tool, ESLint.
  - *What ADR 42's propagation took (PR #126, with the ladder's changes):*
    - 179 files, +1,625 −503 lines;
    - three agents, at 409–770 seconds and 216k–256k tokens each.
- **Implication:**
  - A rule of the shape "this API is called only in this file" costs a scanner per language, each with its own tests.
  - The map measures conformance per concept ("what the language still owes"); nothing measures it per rule.
- **Severity:** medium. **Confidence:** high.
- **Action:** rules of that shape become data, read by one generic scanner per language (I7); a conformance table per
  rule and language in the rendered README.

### F11. The evaluation is careful about procedure and weak in numbers

- **Evidence, for:**
  - hidden tests no agent sees;
  - triage and repair rules written before the runs (`j5/triage.md`, `repairs.md`);
  - a kit rehearsed and checked against a written standard (`dry-run.mjs`, `kit-check.mjs`, `kit-standard.md`);
  - replay alone before an escalation counts;
  - independent readers (three at J4);
  - the machine's Node and a cap on concurrent ladders (`machine.mjs`);
  - the logs and gradings pushed after each delivery.
- **Evidence, against:**
  - *Trees:* one per arm in J5b; three in J2–J4.
  - *Tuned kit:* J5b's kit was tuned on the requests it is graded on (three-arms README, "Requests no kit was tuned
    on").
  - *One family:* every model is from one provider.
  - *Infrastructure failures:*
    - the machine and its trees lost (J5, 10 November);
    - a hung end-to-end gate held 46 minutes (J5b, request 73);
    - load-induced timeouts (J4's verdicts);
    - dates near midnight (`awayFromMidnight` in `grade.mjs`).
  - *Grading time* grew with the backlog to 25–40 minutes a request. The parallel grader validated today gives the
    same verdicts in 8.7–10.9 minutes instead of 24.8–26.1 (simple-3 at 100, clean-3 at 84; 101 and 85 files
    identical).
  - *Costs:* grading compute and the maintainer's repair time are not counted in dollars.
- **Implication:** the records can say "no difference without separate ranges", and little more.
- **Severity:** high for J6's conclusions. **Confidence:** high.
- **Action:** §D, Experiments A–C.

### F12. Adoption friction is in the packaging, not the workflow

- **Evidence:**
  - *Node:* the root tooling declares `"node": ">=22"`, the TypeScript reference and a created application `>=24`
    (`package.json`, `typescript/package.json`). A machine on Node 22 cannot run the reference's scripts (seen in
    this session).
  - *One name, two packages:* the TypeScript reference's `package.json` is named `clean-ddd` (version 4.0.0), and so
    is the published tooling (version 0.3.0, `package.json` at the root). A created application installs the tooling
    as `clean-ddd` (J5b's trees pin 0.2.0).
  - *Releases:* `publish.yml` publishes on a tag equal to `v<version>`. The repository's tags are `v1.0.0` to `v3.1.0`,
    and none is `v0.3.0`. Whether 0.3.0 is on npm was **not verified**.
  - *Messages:* errors name the rule's id, the fix and the command that explains it, in ESLint and in each language's
    check, for instance `DOMAIN-ONE-CLOCK: … (yarn architecture rule DOMAIN-ONE-CLOCK)`. That is good.
  - *The README* opens with 42 lines of findings before "Get started" (line 59), in an 87 KB file.
- **Severity:** low to medium. **Confidence:** high on the facts, low on their effect on adopters, which nothing
  measures.
- **Action:** I9.

### F13. CI is broad for the code, and absent for the benchmark

- **Evidence:** `ci.yml` has these jobs: `scope`, `site`, `tools`, `typescript`, `rust`, `python`, `go`, `web` and
  `check`.
  - Each language runs its checks, its tests and the shared scenario against its own server.
  - `tools` runs the contract check, format, lint, typecheck, the tooling's tests (which create applications in
    TypeScript and Python and gate them, `gate.spec.ts`) and the flow's tests.
  - `publish.yml` publishes with provenance on a tag; `pages.yml` deploys the site.
- **Status:**

  | Capability | State |
  | --- | --- |
  | Architectural conformance, generated documents, the shared scenario, the flow's unit tests | Implemented |
  | A created application per language in CI (TypeScript and Python only, in the tooling's specs) | Partial |
  | Release (the tag scheme and the published version disagree, F12) | Partial |
  | Failure diagnostics (`cat server.log` on a failed scenario; no artifacts uploaded) | Partial |
  | Coverage | Missing |
  | Any benchmark step, even a dry run of a kit with no agent | Missing |
  | Regression on the flow's grader against a known tree | Missing |

- **Severity:** medium. **Confidence:** high.
- **Action:** I10.

### F14. Lite exists in TypeScript only, and has never run

- **Evidence:**
  - RFC 0002: steps 1–5 are done, step 6 (the pilot) and step 7 (the campaign) are not.
  - The building blocks are in TypeScript (`typescript/src/Architecture/Application/Lite/`,
    `typescript/src/Architecture/Presentation/Lite/`).
  - `create --profile lite` exists.
  - The three-arms protocol is a draft, and RFC 0005's decisions D1–D5 are open.
- **Implication:** Lite is supported by the cost evidence (F1, F2) and by the literature (RFC 0005 §2). Its value is a
  hypothesis.
- **Severity:** high for the roadmap. **Confidence:** high.
- **Action:** pilot it, then decide by J6's registered criteria. Introduce nothing more until then.

## C. Proposed improvements

Each is stated once; "§D" gives its priority.

### I1. The API's specification as data, in every created application

- **Problem:** F3's shapes, statuses, nulls and states. The kit standard holds a kit to its API, and the application
  does not hold itself to one.
- **The proposal:**
  - an `api/` directory of JSON Schema per route and status, holding the states a resource can be in and the fields
    `null` in each;
  - read by the route schemas and by the end-to-end tests, as the kit's grader already does with `API_SCHEMA`;
  - ADR 41's operation becomes one of its entries.

  RFC 0005, P2.
- **Expected benefit:** a request's shape decided once, before the code, and refused by the application's own tests
  when the code departs from it.
- **Complexity:** medium (the four languages, `create`). **Maintenance:** one more data source, which removes a prose
  rule (R3, R5).
- **Tokens and cost:**
  - **hypothesis:** fewer escalations on shape failures;
  - a little more to read on every request touching the API.
- **Risks:** a schema written after the code adds work and catches nothing. The order (schema first) must be the
  checklist's.
- **Measured by:** in J6, no triaged failure on a convention the schema states (RFC 0005, H2).

### I2. Integration events as versioned schemas, with their payload in the inventory

- **Problem:** F5. Payloads drift unseen across languages, evolution cannot be represented, and identity across
  contexts is review-only.
- **The proposal:**
  - each integration event is declared once as data, in the shared kernel's directory of the contract (a name, a
    version, the payload's JSON Schema, and `announces: <thing>` for a creation);
  - each language's types are checked against it, or generated from it;
  - the inventory records payload fields, so ARCH-ONE-APPLICATION compares them;
  - the check refuses a breaking change to a published version: a field removed, renamed or retyped needs a new
    version;
  - an event that `announces` a thing must carry its id (ADR 33).
- **Expected benefit:** three categories closed by data: payload drift, silent breaking change, and the missing id.
- **Complexity:** medium to high (the four languages, the inventory writers). **Maintenance:** lower afterwards; an
  event is changed in one place.
- **Tokens and cost:** neutral on a request that uses an existing event. Slightly more on one that adds an event.
- **Risks:**
  - generated types can be harder to read for an agent;
  - checking the hand-written types against the schema is the safer first step.
- **Measured by:**
  - a probe: change a payload field in one language and see the check refuse it;
  - in J6, no failure on a cross-context field or id.

### I3. Relationship tests in every binding

- **Problem:** F4. DOMAIN-IDENTITY's mechanical half is in TypeScript only.
- **The proposal:** `relationship_tests` in `rust.yaml`, `python.yaml` and `go.yaml`, and each language's gate step
  that runs them.
- **Benefit:** ADR 33's test refuses the new id in every language.
- **Complexity:** low to medium. **Maintenance:** follows the TypeScript step. **Tokens and cost:** neutral.
- **Measured by:** the J5 probe of request 64, replayed in one other language.

### I4. Pattern-shaped rules as data, one scanner per language

- **Problem:** F10. Each forbidden-call rule costs four scanners.
- **The proposal:** a table in the contract:
  - each entry has a rule id, the files it allows, and per language the calls it refuses (`Date.now`, `time.Now`, …),
    as a `forbidden_calls` entry under the binding, since paths are a binding's;
  - each language's tool gets one generic reader of that table.

  DOMAIN-ONE-CLOCK and the "publishes on the bus" half of API-CALLER-AT-TRANSPORT move into it.
- **Benefit:** the next rule of that shape is a data edit in four bindings, and no code.
- **Complexity:** medium, once. **Maintenance:** lower.
- **Risk:** a table cannot express every rule. Keep it to "this call, only here".
- **Measured by:** the files changed to add the next such rule.

### I5. A budget for the created guide; every rule stated is checked or marked `review`

- **Problem:** F7. RFC 0005, P3.
- **Benefit (hypothesis):** fewer tokens read per attempt, with no loss of success. The literature predicts no loss.
- **Complexity:** low. **Risk:** a rule taken out of prose that no check holds is lost. Hence the `review` mark.
- **Measured by:** cache-read tokens per attempt, and failures on `review` rules, in J6.

### I6. No agent turn on bookkeeping

- **Problem:** F6.
- **The proposal:**
  - everything the tooling can derive is derived by the verdict's `--fix`, never asked of the agent: documents, a
    storm marked done, the map's rendering;
  - the ladder classifies each line it sends back (bookkeeping, the agent's own, waiting on another owner) and logs the
    class.
- **Benefit:** fewer turns. The classification also says how many are left.
- **Complexity:** low. **Measured by:** the classified lines in J6's logs.

### I7. Orchestration: one agent by default, the split above the break-even, the grading off the critical path

- **Problem:** F8 and F11's grading time.
- **The proposal:**
  - corrections 12 and 13 are in;
  - `gradeWorkers` is validated (F11);
  - next, start request N+1 while request N is graded, and discard it if N fails (**hypothesis:** at about 85–95%
    step-0 delivery, the grading leaves the critical path; it is not measured).
- **Complexity:** medium for the pipelining (discard and rebase on failure).
- **Risk:** wasted agent work on a failure. Interference between a grading and an attempt on a 4-core machine.
- **Measured by:** lead time per request, and dollars wasted on discarded attempts.

### I8. Lite: pilot, then decide

- **Problem:** F1, F2, F14.
- **The proposal:** RFC 0002 step 6. One Lite tree beside one tree of each other arm, on requests 1–10, not counted;
  then J6 by its registered criteria (median cost at most 0.6 of Full's, Full's structural passes kept, no more
  triaged failures). RFC 0005's D1 (decisions as pure functions) is taken before the pilot or left out.
- **Introduced only if** J6 supports it. No other profile until then.

### I9. Adoption: packaging and the first screen

- **Problem:** F12.
- **The proposal:**
  - one Node floor across the root, the reference and `create`, or `create` checking it with a clear message;
  - the TypeScript reference's package renamed (`clean-ddd-typescript`, private) so the published name is the
    tooling's alone;
  - the tooling's tags aligned with its version (`tools-v0.3.0`, `publish.yml` to match), with release notes from the
    ADR index;
  - the README's "Get started" moved to the top, the findings linked.
- **Complexity:** low. **Compatibility:** the rename touches scripts that refer to the reference's package by name.
  Check with a search first.
- **Measured by:** Experiment B's time to first green gate on a created application.

### I10. CI: what is missing

- **Problem:** F13.
- **The proposal:**
  - a created application per language, gated in CI;
  - a nightly dry run of a registered kit with no agent (`dry-run.mjs`: every hidden test fails before its feature);
  - the grader's regression: a stored small tree graded sequentially and in parallel, with equal verdicts;
  - server logs uploaded as artifacts on failure;
  - coverage reported, not gated.
- **Complexity:** low to medium. **Cost:** CI minutes. The nightly jobs are kept off the PR path.

## D. Prioritized roadmap

| | Recommendation | Why at this level |
| --- | --- | --- |
| **P0** | I2 integration events as versioned schemas, payloads in the inventory | Correctness across contexts and languages, F5 |
| **P0** | I3 relationship tests in every binding | A guarantee that failed (J5's 64) is mechanical in one language of four |
| **P0** | I1 the API's specification as data (RFC 0005 D2) | The category behind most triaged failures, F3 |
| **P1** | I6 no turn on bookkeeping, lines classified | Measurable turns and tokens |
| **P1** | I5 the guide's budget | Measurable tokens; the literature predicts no loss |
| **P1** | I7 grading off the critical path (parallel: done; pipelining: next) | Lead time, measured |
| **P1** | I8 Lite pilot, then J6 | The cost question, by its registered criteria |
| **P2** | I4 pattern-shaped rules as data | Maintenance of four languages |
| **P2** | I9 packaging and the first screen | Adoption |
| **P2** | I10 CI: created applications, a dry run, the grader's regression, artifacts | Reliability of the tools |
| **P3** | RFC 0005 D1 decisions as pure functions, in Lite | Promising, unmeasured |
| **P3** | Experiments B and C at scale; a second model provider | Generality of the conclusions |

## E. Implementation plan (for the P0 and P1 items, once accepted)

### I2: integration events as versioned schemas

- **Components:**
  - `conventions/architecture.yaml` (the contract says where contracts live and the compatibility rule; no path);
  - each binding names the directory;
  - `typescript/src/SharedKernel/Application/IntegrationEvents/`, and its equivalents in Rust, Python and Go;
  - the four inventory writers (`tools/src/inventory.ts`, `rust/tools/conventions/src/inventory.rs`,
    `python/tools/conventions.py`, `go/tools/conventions`);
  - the check (`tools/src/check.ts`).
- **Changes:**
  - a schema file per event and version;
  - each language's check compares its type with the schema;
  - the inventory gains `payload` per contract;
  - the check refuses a breaking change to a published version, and an `announces` event without its id.
- **Tests:** a spec per refusal (a field removed, renamed, retyped; an id missing; a payload different in two
  inventories), and the four inventories regenerated.
- **Decision:** an ADR "An integration event is a versioned schema", superseding the prose in CTX-CONTRACTS's `why`.
- **Compatibility:** existing events become version 1 with their current payload. Nothing breaks.
- **Validation:**
  - at the root, `yarn conventions:write` and `yarn check:conventions`;
  - in Rust, `cargo run -p conventions`;
  - in Python, `uv run python -m tools.conventions`;
  - in Go, `go run ./tools/conventions`;
  - the shared scenario against the four servers.

### I3: relationship tests in every binding

- **Components:** `conventions/rust.yaml`, `python.yaml`, `go.yaml` (`relationship_tests`), the gate's relationship
  step (`tools/src/gate.ts`), and one relationship test per language for an existing link (Notes → Notifications).
- **Tests:** the gate refuses a branch where the downstream builds a new id. That is ADR 33's probe, per language.
- **Decision:** a paragraph in ADR 33's implementation status. No new ADR.
- **Compatibility:** none broken. **Validation:** the gate in each language on a probe branch.

### I1: the API's specification as data (after RFC 0005 D2)

- **Components:**
  - `api/` in the reference and in `create`'s template;
  - the four languages' route schemas or response checks;
  - the end-to-end specs, which validate answers against it (as `API_SCHEMA` does in the kit's grader);
  - `api-schema.mjs` reused.
- **Tests:** an answer that departs from the schema fails the reference's own end-to-end tests, in each language.
- **Decision:** an ADR, folding in ADR 41's operation.
- **Compatibility:** the reference's current answers become the schema. Nothing changes on the wire.
- **Validation:** the scenario and each language's end-to-end tests.

### I6: bookkeeping, then I5: the guide's budget

- **Components:** `run-ladder.mjs` (classify `feedback()` lines), `tools/src/gate.ts` (`--fix` covers each derived
  document), `tools/src/create.ts` (the guide's sections), and a check of the guide's size.
- **Tests:** the flow's tests on the classifier; a spec of `create` that the guide stays under budget, and that each
  rule it states carries an id or `review`.
- **Validation:** `yarn test`, `yarn test:flow`, and a created application's gate.

### I7: pipelining the grading

- **Components:** `run-ladder.mjs`. Start the next attempt from the head under grading; on a failure, discard it and
  restart from the new head.
- **Tests:** a dry-run ladder with a stand-in agent (`runners.mjs`), in which the second feature starts before the first
  is graded, and is discarded when the first fails.
- **Compatibility:** off by default, a plan field.
- **Validation:** one OpenStay checkpoint of ten requests, timed with and without.

### I8: the Lite pilot

As RFC 0002 §12 step 6 says, after RFC 0005's D1–D5 and the three-arms protocol is registered.

## Three controlled experiments

Each is registered before its first run: the kit, the criteria and the profile data, hashed and committed.
Infrastructure failures are classified apart: a failure that passes when replayed alone is never counted against an
arm, and is logged. No result here is anticipated.

### Experiment A — Architecture efficiency (Plain, Lite, Full)

- **Hypothesis:** Lite's median agents' cost per delivered feature is at most 0.6 of Full's, with no loss of Full's
  structural passes, and no more triaged failures. Full's cost of change is lower than Plain's (RFC 0005, H3).
- **Protocol:**
  - the three-arms protocol: a new application written before any run (2–4 contexts, a money invariant, about forty
    requests in checkpoints of ten), and OpenStay's requests 1–10 as a calibration, not counted;
  - three trees per arm;
  - the same ladder, triage rule, grader (`gradeWorkers` fixed) and budgets;
  - one unannounced change per checkpoint;
  - features above the split's break-even registered split and not.
- **Controls:** the model versions, harness version, machine, Node, and concurrent ladders (`machine.mjs`); the same
  kit hash for every arm.
- **Metrics:**
  - per attempt and per request: cost, tokens (cache read, output), turns and lead time;
  - escalations, real or not, and triaged failures;
  - for each unannounced change: its cost, files and contexts touched, and whether it was delivered at step 0;
  - the slope of cost per request against its index;
  - the structural passes: the O-rubric, read blind by two readers.
- **Acceptance:** RFC 0002 H8 for Lite. For Full against Plain: a lower median cost of change with ranges apart.
- **Limitations:**
  - one application and one model provider;
  - forty requests may be too few for structure to pay;
  - three trees give ranges, not tight intervals.
- **Reject the hypothesis when:**
  - Lite's cost ratio is above 0.6, or its range overlaps Full's;
  - or Lite loses a structural pass Full holds;
  - or, for H3, Full's cost of change is not lower than Plain's with ranges apart.

### Experiment B — Knowledge transfer

- **Hypothesis:** with the repository's documentation and tooling alone, a fresh agent diagnoses an incident, changes
  an existing behaviour and adds a feature in a Full or Lite application at least as reliably as in a Plain one. It
  also guesses less: fewer decisions it reports as guessed.
- **Protocol:**
  - the fresh-agent evaluation of `docs/evaluations/README.md`, extended to three tasks on a grown tree from
    Experiment A (one per arm, at request 30);
  - an incident: a failing hidden test and a log, with the cause in code written twenty requests earlier;
  - a behaviour change in words;
  - a feature;
  - the agent is told nothing of the records.
- **Controls:** the same tasks, model and budget per arm; the same rubric, written before; a grader blind to the arm
  where possible.
- **Metrics:**
  - tasks resolved;
  - time and cost to the first green gate;
  - files read before the first edit;
  - decisions reported as guessed;
  - regressions introduced.
- **Acceptance:** Full or Lite resolves at least as many tasks as Plain, with fewer guessed decisions.
- **Limitations:**
  - an agent's report of what it read can be wrong; it is checked against the documentation at the base commit, as
    the protocol says;
  - few tasks.
- **Reject when:** Plain resolves more tasks, or guesses no more than the architecture arms.

### Experiment C — Production robustness

- **Hypothesis:** under controlled faults, Full and Lite lose and duplicate no business fact, and Plain does. The
  faults:
  - a crash between commit and publication;
  - a duplicated event;
  - a retried webhook;
  - two servers on one database;
  - a provider that fails partially.
- **Protocol:**
  - the robustness kit (`docs/evaluations/benchmark/robustness/`), extended with:
    - a duplicated delivery of an integration event;
    - a payment provider that times out after charging;
    - a crash during a reaction;
  - each fault is a hidden test that kills the process group or replays a message;
  - applied to the trees of Experiment A at request 40.
- **Controls:** the same fault scripts, SQLite and PostgreSQL both, and the same seeds; ten repetitions per fault.
- **Metrics:** facts lost, facts duplicated, money moved twice, and operations left PENDING. It is a count per fault
  and repetition.
- **Acceptance:** zero lost or duplicated facts and zero double payments in Full and Lite across all repetitions.
- **Limitations:**
  - the October campaign found the plain trees passed the first version of these tests, so the faults must be harder
    than those;
  - an in-process bus hides network failures.
- **Reject when:**
  - a Full or Lite tree loses or duplicates a fact;
  - or Plain shows no defect under the same faults, in which case the outbox and the inbox do not justify their cost
    on this evidence.

## F. The answer: the smallest set worth keeping

On the evidence above, the smallest set is the following. Each item is marked **measured** (a record shows its
value), **mechanical** (a tool holds it already) or **hypothesis**.

**Guarantees, all held by a tool:**

1. **Contexts apart, and the map declared.** The dependency table, and the relationships declared before the code
   (ARCH-INWARD, CTX-CONTRACTS, CTX-MAP-DECLARED). *Measured:* locality under the storage change, no drift.
   *Mechanical.*
2. **Every seam an executable contract.**
   - *The API:* shapes, statuses, states and nulls, and the operation.
   - *Integration events:* versioned schemas that carry the identity they announce.
   - *Who may call:* a command declares it once, and the transport refuses (ADR 39).

   *Measured:* every triaged failure was at one of these seams. *Hypothesis:* making them data closes the categories.
   I1 and I2 are the work.
3. **Facts durable with their state, delivered at least once, received once:** the outbox and the inbox, where a fact
   crosses a context. *Measured:* no money defect in Full. Lite holds it on its trigger. Experiment C says whether it is
   needed.
4. **Consistency where several writers race:** optimistic versions on the aggregates that have them (CONC-OPTIMISTIC,
   conditional in Lite). *Measured:* a simple tree could pay twice under two servers.
5. **Determinism at the edges:** one clock, and every other source of non-determinism behind a port.
   *Mechanical* since ADR 42.

**Coordination:**

1. **One agent by default, the smallest model first, escalation on a hidden-test failure, a replay alone before it
   counts.** *Measured:* 47 of 50 and 27 of 33 delivered at step 0 by the smallest model.
2. **The split by context only above its break-even, contract first, with an integrator that owns the merged gate.**
   *Measured:* safe, and slower below the break-even. *Mechanical* since corrections 12 and 13.
3. **A verdict that is a gate fixing its own bookkeeping, and sends back only what the agent can fix.** *Partly
   mechanical.* I6 measures the rest.
4. **A short guide whose rules are checks.** *Hypothesis* (I5), supported by the literature.

**Everything else is a candidate for removal, and Lite tests exactly that:**

- the command bus;
- a handler class and a folder per command;
- `CommandEvent` classes;
- an aggregate for every thing;
- an ADR per feature (clean-3 holds 85).

No record shows them buying anything; RFC 0002 §1 lists them as "mandatory by no rule". They stay in Full until J6
decides.
