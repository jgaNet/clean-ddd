# OpenStay: a long horizon, with checkpoints

[ADR 31](../../../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) leaves two things that could still change its verdict:
- **robustness under failures and concurrency** (its item 1);
- **a long horizon** (its item 4): several trees per arm, dozens of features, and the cost of each change measured as the code grows.

OpenStay is the domain both are measured on: a lodging marketplace with no commission, specified by [the maintainer's brief](brief.md). It replaces the seven-feature notes backlog, which [has said what it can](../../2026-10-30-flow-control.md), with a domain that has hard invariants: no double booking, a price and its conditions kept as accepted, money moved once.

This protocol is written before any run, like [the control](../control/README.md), [the extensions](../extensions/README.md) and [the robustness kit](../robustness/README.md). It keeps their rules:
- **the same driver and grader for every arm;**
- **hidden tests no agent sees;**
- **no difference without separate ranges;**
- **every defect of a kit recorded as an amendment.**

The work before the first run is in [the framing](j0.md), with the decisions the maintainer took. [The pilot's kit](pilot/README.md) is checkpoint J1: written, reviewed, rehearsed, its storms decided. The pilot, checkpoint J2, ran on 2026-11-01: [its record](../../2026-11-01-openstay-pilot.md). J3, fifteen more features and the first change not announced in advance, ran on 2026-11-01 and 2026-11-02 from [its kit](j3/README.md): [its record](../../2026-11-02-openstay-j3.md). J4, twenty-five more features with money, a storage migration and a domain split, ran on 2026-11-02 and 2026-11-03 from [its kit](j4/README.md): [its record](../../2026-11-03-openstay-j4.md).

## Two tracks

- **The benchmark track** builds the marketplace's core behind an HTTP API, in each arm's trees. It is graded by hidden black-box tests over that API.
- **The product track** builds the web interface, the optional conversational layer and the real integrations: a payment provider, mail, maps. It is built once, on the API contract the benchmark has stabilised, after the pilot. Its repository is [jgaNet/openstay](https://github.com/jgaNet/openstay) (private), started on 2026-11-01 from the Clean DDD starting tree and the brief. The benchmark's kit stays here.

The two are kept apart because a hidden test must be deterministic, and a conversation is not. The brief's success criteria for a production service are out of the benchmark's reach: real bookings, legal compliance, operations. [The framing](j0.md#what-the-benchmark-can-and-cannot-show) says which ones the benchmark informs.

## The arms

| Arm | What it is given | Its driver's verdict |
| --- | --- | --- |
| **Simple** | A plain TypeScript project and each request in product words | `yarn verify` |
| **Clean DDD** | `clean-ddd create`, the tooling, each request and its storm | the gate, with `--fix` |

- **Three trees per arm,** each grown by its own agents. Four, if the pilot shows that three cannot separate the arms.
- **The multi-agent fan-out is not a third arm.** The records show it pays only on wide features, so it is measured on the wide features chosen in advance, starting from the same commit as the one-agent run (as in [E2](../../2026-10-30-flow-extensions.md#e2--one-agent-with-the-fan-outs-contract-a)). The first such feature is payment through the provider, in phase 2.
- **The generated boilerplate is not a third arm either.** At J4, the Clean DDD arm's cost per feature grew faster than the simple arm's, and most of what it pays for is the layers, the wiring and the gates, not the rules. J5 measures that share on a few chosen features:
  - **The generator** is part of the harness, written and tested on the solvability tree before J5. From the feature's storm and the contract (`architecture checklist`, `architecture place`), it writes the commands, events, queries, handlers, routes, wiring entries and test skeletons. It writes no rule: a behaviour's body, a refusal or a query's SQL is left for the agent.
  - **The run** starts from the same commit as the ladder's one agent, on a copy of the tree, with the same request, storm, ladder and gate.
  - **The measures** are the cost, the steps, the escalations, the gate's send-backs and the hidden tests, set beside the one-agent run. The generated tree is read with the same rubric, so that a cheaper feature that hides its rules in the generated files is seen.
- **Six more side experiments at J5, on both arms** (decided by the maintainer on 2026-11-03). J4 tested the case most favourable to the simple arm: precise requests, trees that fit in the agent's context, one agent that wrote the whole tree, and hidden tests that see only the way things go when nothing goes wrong. These six take each of those away in turn. Each runs on copies of every arm's trees, from the same commit, with the same ladder, and is written and rehearsed before J5 starts.
  - **A limited context.** A few of J5's features replayed with the agent's context capped (about 30,000 tokens), to see whether the Clean DDD arm's slice of a context keeps its cost flat when the whole tree no longer fits. It is the cheapest test of the series' central hypothesis, and it does not wait for the trees to grow.
  - **Chaos on the money.** A hidden suite of its own, beside the acceptance tests, with no request change: concurrent refunds and payouts, webhooks replayed while a server restarts, and a crash between the call to the provider and the write that records it. It is run on every final tree, and scored like the hidden tests: a failure is a defect, counted per tree.
  - **A maintainer who did not write the tree.** The reading's change probes, carried out: a fresh agent, with no history of the tree, makes each probe's change (a second provider, a cleaning fee, a minimum payout) on every final tree. It is graded by its own hidden tests and by every earlier one, and its cost, the files it read and the regressions it caused are counted.
  - **Vague requests.** A few of J5's features written a second time in product words only, with no route, body or status, and graded by the same hidden tests. The Clean DDD arm's storm forces the open questions to be decided before the code, and the maintainer's answers count as that arm's cost, as for every storm. The measures are the escalations, the amendments the requests needed and the cost.
  - **Debugging.** Ten plausible defects injected into every final tree (a rounding, an inverted condition, a fact never recorded, a webhook handled twice), one at a time. A fresh agent gets the symptom a user would report, and nothing else. The measures are how many it fixes, its cost, and the regressions its fix causes.
  - **Review.** A fresh agent reviews pull requests on every final tree, some of them carrying a defect put there on purpose. The measures are the defects it finds, the ones it misses, and the ones it reports that are not there.
- **No arm sees the brief.** Its §6 names this repository's architecture, and its §10 starts with an event storm. Every arm gets the same requests, written in product words, one at a time.
- **The storms count as the Clean DDD arm's cost.** A storm decided with the maintainer, before its feature's run, is design work the simple arm does not get. The maintainer's time on each storm is recorded with the arm's cost.

## The models: the smallest first, one step up when it fails

The series uses three models of one family: the smallest, the intermediate one and the strongest. Each costs more than the one below it. The exact version of each is pinned in the execution plan for a whole series.

Every feature of every tree starts with the smallest model.

**The escalation rule.** A feature is done again one step up, with the next model, from the commit it started from, with the same request, if its attempt does any of the following:
- fails one of its hidden tests;
- breaks an earlier feature's hidden test;
- passes its time or budget ceiling, as the supervisor records it;
- ends with its driver's verdict refusing the tree.

The steps are smallest, then intermediate, then strongest. No step is skipped: a feature reaches the strongest model only after the intermediate one has failed it. A feature the strongest model also fails is a failed feature, as in every campaign before.

Before an escalation, the failure is checked against the kit. A defect of the kit is an amendment, never an escalation.

**Per tree and per feature.** Each tree escalates on its own. The next feature starts with the smallest model again.

**What is recorded, for every feature of every tree:**
- the model of each attempt, the step the feature was delivered at, and the reason for each escalation;
- the time, the reported cost and the turns of each attempt, failed attempts included;
- the size of the tree when the feature started: source lines, files and contexts or modules.

**The hypothesis this tests.** *The step features need rises faster in the simple arm than in the Clean DDD arm as the trees grow.* It is read in windows of ten features, from the pilot on, on two measures:
- the share of features delivered above the smallest model;
- the share delivered only by the strongest.

It is refuted if the two arms' curves stay within each other's ranges, or if the Clean DDD arm's rise faster.

**A strongest-model witness.** At the pilot, one tree per arm runs the same ten features with the strongest model only. It shows what a feature costs without a failed attempt, and whether the smaller models change which arm is ahead. [E1](../../2026-10-30-flow-extensions.md#e1--a-weaker-model) already showed that the smallest model widens the cost gap.

## The checkpoints

| | What is done | Agent spend | What lets it continue |
| --- | --- | --- | --- |
| **J0** | The framing, the decisions | none | The maintainer has taken [the decisions](j0.md#decisions-for-the-maintainer) |
| **J1** | The kit of the ten pilot features, written and rehearsed; the escalation in the harness | none, apart from one review of the tests by a fresh agent | `dry-run` finds no defect on the starting trees; the storms are decided |
| **J2** | The pilot: ten features, 2 arms × 3 trees, plus the witness | estimated at $60–130, plus $30–60 for the witness | Budget re-estimated from the measured cost per feature; both arms deliver |
| **J3** | 25 features, and a first change not announced in advance | re-estimated at J2 | The question is still open (see below) |
| **J4** | 50 features: payments, a storage migration, a domain split | re-estimated at J3 | The same |
| **J5** | 100 features, two side experiments on copies of the Clean DDD trees, each beside the ladder's one agent per feature, from the same commit: a few of J5's cross-context features replayed as a fan-out by context (`run-slices.mjs`), and features with disjoint contexts run in parallel (decided by the maintainer on 2026-11-02); and the same features with the boilerplate generated from the storm before the agent runs, so that the agent writes the rules and the queries and nothing else, to measure how much of the Clean DDD arm's cost per feature is the layers rather than the rules (decided by the maintainer on 2026-11-02, after J4's first figures showed that gap growing); and six on both arms: a limited context, chaos on the money, a maintainer who did not write the tree, vague requests, debugging injected defects, and reviewing pull requests that carry one (decided by the maintainer on 2026-11-03) | re-estimated at J4 | — |

**Each checkpoint ends with a decision: continue, adjust or stop.** Two outcomes stop the series before J5, and either is a result that gets published:
- the ranges have separated, so the question is answered;
- nothing could still separate them: the simple arm's cost and escalations stay flat, and the robustness tests do not tell the arms apart.

**The ceilings.**
- Each checkpoint's budget is reserved before any agent starts (`budget()` in [the harness](../../../../.claude/flow/README.md#supervision-what-lets-agents-run-unattended)).
- Each attempt has its own ceiling of time and spend.

**A model that changes mid-series.** If a pinned model is withdrawn, the series continues on its successor only after a witness series. That series replays the last checkpoint's features on both models.

**Every kit is rehearsed before its runs.** It goes through [`dry-run`](../../flow/dry-run/README.md), and its report is committed with it.

## The four scores, kept apart

| Score | Measured by |
| --- | --- |
| Functional correctness | The hidden tests of every feature delivered so far, rerun at each checkpoint for regressions |
| Robustness | The hidden tests that kill the server, race writers and fail an outside service, from the pilot on |
| Maintainability | An independent reading at each checkpoint, against the control's [rubric](../control/reading.md). A smaller model can pass the tests and leave a tree the next feature pays for, and only the reading sees that. |
| Cost of change | Time, cost, escalations and the spread of each change (files, modules or contexts), per feature and cumulated |

## Biases, written down now

- **Author of everything.** The same author wrote the architecture, the protocol and the requests, and will write the hidden tests. Two things reduce this, without removing it:
  - a fresh agent, with only the requests, reviews the tests before each kit is frozen;
  - the maintainer decides every hot spot.
- **The brief speaks Clean DDD.** It is kept from every arm. The requests are written from its §3–5 in product words, never from its §6.
- **The storms help one arm.** Their cost is counted (see above), but the expertise in them is not priced.
- **A smaller model's failures mix two causes:** the model and the architecture. Each escalation is recorded with the reason the rule gave. A sample of failed attempts is read, to say which of the two they were.
- **SQLite, one machine.** Contention is between processes on one file until J4 moves storage to a server database.
- **Few trees.** Three per arm. A result is a range, never a mean.
