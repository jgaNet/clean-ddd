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

The work before the first run is in [the framing](j0.md), with the decisions the maintainer took. [The pilot's kit](pilot/README.md) is checkpoint J1: written, reviewed, rehearsed, its storms decided.

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
| **J5** | 100 features | re-estimated at J4 | — |

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
