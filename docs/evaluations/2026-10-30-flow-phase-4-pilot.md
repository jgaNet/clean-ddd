# Flow, phase 4 — the pilot: four arms, one run each, the whole backlog from an empty project

**Date:** 2026-10-30 · **Proposal:** [RFC 0001](../rfc/0001-architecture-aware-multi-agent-flow.md) §10, phase 4 · **The kit, written before any run:** [`benchmark/`](benchmark) · **Drivers:** [`run-backlog.mjs`](../../.claude/flow/run-backlog.mjs) (A, B), [`run-slices.mjs`](../../.claude/flow/run-slices.mjs) (C, C′, a feature at a time), [`grade.mjs`](../../.claude/flow/grade.mjs) · **Logs, grades, the person's contracts:** [`flow/phase4-pilot/`](flow/phase4-pilot)

The maintainer chose a pilot: one run per arm on the whole backlog, then a decision about the two other runs per arm. A pilot gives single points, not ranges. What follows says what one run of each arm did, and what the runs found in the method, the harness and the tooling.

## The result

| Arm | Features passing (M1–M3) | Lead time | Person time on the critical path | Agent time | Reported cost | Retries · failed integrations |
| --- | --- | --- | --- | --- | --- | --- |
| **A** — one agent | **7 / 7** | **45.6 min** | — | 42.1 min | **$11.85** | 0 · 0 |
| **B** — naive parallel | 4 / 7: features 4, 5 and 7 missing | 25.7 min | — | 36.7 min | $12.15 | 3 · 4, all git conflicts |
| **C** — architecture-aware | **7 / 7** | 65.0 min; about 49 without the harness's defects | about 6 min | 61.9 min | $15.99, plus $3.94 lost to the harness | 0 · 0 |
| **C′** — with the pack | **7 / 7** | 64.5 min; about 52 without the harness's defects | about 6 min | 56.6 min | $17.54, plus $1.10 lost to the harness | 0 · 0 |

**On this pilot, A dominates C and C′:** the same quality, sooner, and for 68 to 74% of the cost. B was the fastest and failed: three features never landed, because three agents changed the Notes context at once and the integrator could not take them all. That is exactly what C's conflict keys exist to prevent.

The reading the RFC asked to be possible is the one the pilot gives: *A is better.* One agent, with the gate, the storms and the context map, delivered the backlog sooner and cheaper than the architecture-aware fan-out. Every thing that makes C work — the storms, the map, the gate — A had too.

**Why C is not faster.** C runs the features one after another and fans out only inside a feature, one slice per context. Four of the seven features cross two contexts. Even there, a feature's time is its longer slice plus about a minute of integration: 4 to 8 minutes, against 3 to 11 for A's agent on the same feature. Parallel slices saved less than the integration and the contract stage cost. The RFC keeps features in parallel for phase 5, "only if phase 4 shows C beats A". This pilot does not.

**Why C costs more.** Each slice is a fresh agent that reads the guide, or the pack, before writing, and the project grows every feature. A's single conversation reads the guide once and then keeps its context, cached: its cumulative cost rose by $0.56 to $2.70 per feature after the first.

## What was run

- **Projects.** Each arm had its own project from `clean-ddd create --language typescript`, built from this branch's package. The arms ran at the same time on one machine of four CPUs: all four overlapped from 08:54 to 09:29, and C and C′ ran on until 10:00. The lead times are read with that.
- **The model.** Every agent was given the same model, named in the execution plan; the logs replace its name by `main`.
- **The kit.** The backlog, the storms with hot spots the maintainer decided on 2026-10-30, the acceptance tests and the rubric were committed before the first run ([the kit](benchmark/README.md)). A and B gave each agent the feature's request and its storm. C and C′ gave each slice its plan and the frozen contract, as phase 2 did.
- **The person in C and C′** was the assistant that ran the benchmark. It did the architecture tasks of features 1, 4, 5 and 6, and the contract stage of every feature: plans, frozen integration events, the acceptance test. Its scripts and its contracts are archived ([`person/`](flow/phase4-pilot/person)). For C′ it applied what it had written for C.
- **The grade.** One script ran the same mechanical half of the rubric on the four final trees, with the same tooling (this branch's package):
  - M1: the gate on the whole run, in the architecture mode;
  - M2: each feature's acceptance test;
  - M3: each feature's storm.

  A second agent, which had not run the benchmark, read the trees for the R items.

## The rubric's read items

A second agent, which had not run the benchmark, read the four final trees against the R items, with a file and a line for each verdict.

| Item | A | B | C | C′ |
| --- | --- | --- | --- | --- |
| R0 — contexts and relationships declared, with an ADR | PASS | PASS | PASS | PASS |
| R1.1 — the password hashed behind a port | PASS | PASS | PASS | PASS |
| R1.2 — the owner from the caller | PASS | PASS | PASS | PASS |
| R2.1 — the note refuses to pin when archived | PASS | PASS | PASS | PASS |
| R3.1 — a tag is a value object; the note holds the limit | PASS | PASS | PASS | PASS |
| R4.1 — an owned port over Accounts' read side | PASS | not delivered | PASS | PASS |
| R5.1 — published through the outbox, with the recipients of the moment | PASS | not delivered | PASS | PASS |
| R5.2 — the consumer in its reaction's transaction, no hand-made idempotency | PASS | not delivered | PASS | PASS |
| R6.1 — the quota decided in Notes, from its repository and the port | PASS | PASS | PASS | PASS |
| R6.2 — Free without anything creating a plan | PASS | PASS | PASS | PASS |
| R7.1 — due by a time given as a parameter with a default | PASS | not delivered | PASS | PASS |
| R7.2 — only a reminder not yet due is cancelled | PASS | not delivered | PASS | PASS |

Nothing fails in a tree that delivered the feature. The four trees' reactions use the building blocks of ADR 30, byte for byte the same in each.

The grader also noted what no item covers:

- **C and C′ left their three relationships `planned: true` after the code came to carry them.** ADR 28 says a relationship is planned *until the feature that carries it lands*, and the check does not refuse a planned relationship the code carries. The single writer marks the storm and the plans carried (ADR 29), but not the relationship, and the person did not either. A, with no person and no writer, cleared its own flags.
- **C′ orders an archiving notification by when the notification was created, not by `archivedAt`.** In one process these are the same moment, so the acceptance test cannot tell them apart, but the backlog says "by when it happened". C′ also writes the "is it due?" rule twice, once in the aggregate, unused, and once in the query adapter.
- **A decides whether a reminder is due in its query adapter, not in its Domain.** C's read model of accounts, exported to Notes, also exposes the password hash, which only the login query should see.

## What the pilot found

### In the tooling — fixed on this branch

- **A done storm was held to the code exactly, so a later feature could make an earlier storm false.** Feature 7 has archiving a note also cancel its reminder. The storm of feature 1, done since, said archiving records `NoteArchived`. The check compared the two exactly, so no code could satisfy both storms.
  - In arm A, the agent saw it and amended feature 1's storm itself, with a comment.
  - In arm C, the Notes slice of feature 7 stopped BLOCKED and diagnosed it exactly. It may not touch another feature's storm.

  The check's own header says what the code adds beyond a storm is not its question. A command or a policy now carries a storm's when it records or publishes *at least* what the storm said ([`storms.ts`](../../tools/src/storms.ts), with a spec). C and C′ were upgraded to that tooling before their feature 7, as a tooling change between features.
- **The gate had no architecture mode.** In A and B, no person declares a context, so the agent does it. `clean-ddd gate --mode architecture` holds such a change to the architecture mode instead of the feature mode: it may touch the architecture, and must record the decision.

### In the harness — fixed on this branch

- **A feature of one slice could not pass its gate.** It carries its whole storm in its own worktree, and the check then wants the storm marked done and the plan's parts marked not new. ADR 29 leaves those flags to the single writer, and the slice may not touch the contract. Phase 2 never met this: its feature had two slices. Both C and C′ stopped BLOCKED on feature 2, the code correct. A single slice now sets those two flags itself, the one change outside its folder it may make.
- **Arm B's first start:** the integration patch began after the storm the driver had placed, so a feature that marked its storm done changed a file the head did not have. B was cancelled after eleven minutes, the driver fixed, and B started again on a fresh project. Its first log is kept ([`b-false-start.jsonl`](flow/phase4-pilot/b-false-start.jsonl)). Its agent was stopped and reported no cost.
- **Stopping an agent leaves the commands its tools started.** Claude Code runs a tool's command in a process group of its own, so stopping the agent's group leaves, for example, a gate it had started still running. When B was cancelled, one gate outlived its agent and was stopped by hand, by process group. Not fixed: cancel and the lease's reclaim stop the agent, not what it left running.
- **The grader** read a run's added dependencies from the created project, and its storms through each project's own tooling. It now installs a tree's own dependencies and grades every arm with the same tooling.
- **The person's clock undercounts.** A start and an end logged in the same command do not count the time spent writing the contract before the command. The person's critical-path time is therefore read from the run logs instead: the gaps between one feature's integration and the next feature's start. In C and C′ that was about 6 minutes in all, once the gaps the harness's own defects caused are left out. The agent playing the person is fast; a person would be slower to read and faster to decide (RFC open question 6).

### In the method — what C's person got wrong, and what caught it

- **Twice the contract stage wrote a plan the tooling refused:**
  - a Notifications plan that consumed an integration event without listing it;
  - two integration events put in a file of their own instead of beside the aggregate's others.

  Both times the driver's contract checks stopped the run before any agent started, in under twenty seconds. That is what the contract checks are for.
- **The person did not foresee that feature 7 reshapes a command of feature 1.** A storm session that reads the earlier storms would have; the tooling now tolerates it.
- **Nobody marks a relationship carried.** In C and C′, the three relationships the person declared `planned` stayed planned after their features landed. The single writer marks a feature's storm and plans carried (ADR 29), but not the map. The check accepts a planned relationship that the code carries. So `planned` says *declared before its code*, never *not yet carried*, and nothing makes it go away. Open: the writer, or the check, should close it.

## Cost

| | Reported |
| --- | --- |
| A | $11.85 |
| B | $12.15, plus its false start's agent, stopped, unreported |
| C | $15.99, plus $3.94 on runs the harness's defects stopped |
| C′ | $17.54, plus $1.10 on runs the harness's defects stopped |
| A probe of how a continued conversation reports its cost | $0.22 |
| **The pilot** | **about $63** |

The probe settled a question phase 3 left open. A continued conversation (`--continue`) reports `total_cost_usd` and `modelUsage` cumulated over the conversation, and `usage` for its own session alone. So the latest figure is the conversation's cost, as phase 3's driver assumed; a session killed before it reports adds nothing to it.

## Next

The maintainer decides whether to run the two other runs per arm, about $120 more. Two things bear on it:

- **The single points are lopsided.** A is ahead on both objectives with the same quality, and it is not the harness's doing: C's lead time without the harness's defects is still above A's. Three runs per arm would turn the points into ranges. It would take a large spread to reverse the order.
- **The comparison as the RFC frames it may be settled for this backlog.** C fans out within a feature; this backlog's features are small, and most are serial by their prerequisites. Where C could win is features in parallel across contexts: RFC phase 5, conditional on this result. The RFC says, if A wins: one agent, with the gate, the context map and the storms. Those are worth having with one agent too.
