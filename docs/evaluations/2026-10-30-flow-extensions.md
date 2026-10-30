# What the control could not show: a weaker model, the fan-out's contract, a longer horizon, real persistence

**Date:** 2026-10-30 · **Protocol and predictions, written before the runs:** [`benchmark/extensions/`](benchmark/extensions/README.md) · **Before it:** [the control](2026-10-30-flow-control.md) · **Logs, plans, grades, metrics:** [`flow/extensions/`](flow/extensions)

The control found that on its backlog, with a strong model, Clean Architecture and DDD did not improve one agent's development. It named what it could not show. This record runs four of those experiments with the same driver, the same grader and hidden acceptance tests:

- **E1:** a weaker model.
- **E2:** one agent given the fan-out's contract (A+).
- **E3:** a longer horizon.
- **E4:** real persistence.

The arms are the control's:

- **A:** the architecture with the `clean-ddd` tooling.
- **D:** the architecture as prose, without its tooling.
- **P:** a plain TypeScript project.

As before, two arms differ only when the ranges of their runs do not overlap.

## The answer, first

| Experiment | What it asked | What the runs say |
| --- | --- | --- |
| E1, a weaker model | Does the architecture help a weaker model deliver? | **No.** P delivered 7/7 twice, at a fraction of the time and cost. A delivered 6/7 and 7/7. D delivered 7/7 twice. |
| E2, A+ | Did the fan-out's speed on feature 8 come from its contract? | **No.** One agent with the whole contract took 22.5–24.8 min, as long as A without it (23.8). The fan-out's 18.9 min came from parallelism. |
| E3, five more features | Does a plain tree get dearer as it grows? | **Not yet.** Every arm passed every new test, with no regression. Per feature, P stayed the soonest and the cheapest. Its time per feature grew by about a third, like D's, while A's grew 5%. One tree per arm is a direction, not a result. |
| E4, SQLite | Do the ports make a storage change cheap? | **They keep it out of the domain, but they do not make it cheaper.** The four architecture runs changed only adapters, wiring and building blocks. The plain runs changed the code of each module. P was still about twice as fast as A or D, with less code, and no regression. |

Across all four, no experiment found a setting where the architecture made one agent deliver more, sooner or cheaper. Two findings speak for the architecture:

- **A change stayed where the architecture says it goes.** This is E4's locality.
- **Only the tooling stopped drift.** D's import violations kept growing over the horizon, and A's cannot exist.

## E1 — A weaker model

The smallest model of the same family ran the seven-feature backlog, two runs per arm. The runs are the same as the control's in every other way.

| Arm | Hidden tests passed | Active time | Reported cost | Source lines added | Test cases |
| --- | --- | --- | --- | --- | --- |
| A, weaker model | 6/7 · 7/7 | 48.4–56.5 min | $3.79–4.82 | 3,619–3,729 | 158–174 |
| D, weaker model | 7/7 · 7/7 | 32.3–39.1 min | $2.61–3.44 | 3,139–3,345 | 153–185 |
| P, weaker model | 7/7 · 7/7 | **19.4–22.4 min** | **$0.55–0.88** | 811–889 | 106–108 |
| *A, strong model (control)* | *7/7 ×3* | *35.3–45.6 min* | *$10.39–12.11* | | |
| *P, strong model (control)* | *7/7 ×3* | *14.0–18.6 min* | *$2.30–3.36* | | |

- **The prediction allowed two outcomes, and neither happened.** The architecture arms did not pass more features than P. They did not clearly pass fewer: A's one failure is a single run.
- **The failure is real, and it breaks a rule of the architecture.** On `plan-and-quota`, A's first run answers `PUT /plans/me` with an unknown plan by a 400 from the request schema. The request asks for a 202 and an `ERROR` outcome. The contract's own rule says a refusal is a result, and the API grammar gives every command a 202. Neither the gate nor the storm check catches a refusal moved into the schema.
- **P differs from A and D on time and cost, and A and D differ on time.** No range overlaps. With the weaker model, P was 2.2–2.9 times sooner than A and 4–9 times cheaper. With the strong model it was about 2.5 times sooner and about 4 times cheaper. The weaker model paid more, relatively, for reading the architecture.
- **D's drift stayed small.** D1 has 2 refusals of the generated import rules, in 1 file. D2 has none.

## E2 — One agent with the fan-out's contract (A+)

Feature 8, team spaces, crosses six contexts. A+ started from the commit the fan-out C′ started from, after its contract stage. One agent got everything the six slices had:
- the request;
- the storm;
- the six plans;
- the frozen contracts;
- the acceptance test, which it could run.

| | Active time | Cost | Feature 8's tests | Features 1–7 afterwards |
| --- | --- | --- | --- | --- |
| A, one agent, request and storm (campaign) | 23.8 min | $8.67 | 8/8 | no regression |
| **A+, one agent, the whole contract** | **22.5–24.8 min** | **$8.24–8.53** | 8/8 · 8/8 | no regression |
| C′, six slices (campaign) | 18.9 min | $15.07 | 8/8 | no regression |

- **The contract did not make one agent sooner.** A+ sits on A's single run, and both stay above C′.
- **The prediction is answered:** the parallelism carried the fan-out's gain, not the contract. The contract stage is what makes the parallelism safe. Without the parallelism, it buys nothing measurable.
- This confirms the rule `clean-ddd strategy` applies: fan out only where a feature's contexts are many and its time matters more than its cost.

## E3 — A longer horizon

Five more features, 9 to 13, were run in one conversation on one finished tree of each arm: A run 3, D run 2 and P run 2. They change what exists:
- comments;
- a note's history, with a restore;
- editors on a shared note;
- deleting an account and everything it owns;
- full-text search.

**Every arm passed every new hidden test, 5/5, and kept features 1–7.** One assertion is the exception. Feature 11 changes a rule of feature 4 on purpose: sharing again now changes the role, where it was refused. P's and D's trees follow feature 11 and fail feature 4's old assertion. Without that assertion, both pass. See [amendment 3](benchmark/extensions/README.md#amendments). A's tree still refuses sharing again with the same role, which passes both.

| Tree | Features 1–7: minutes and cost per feature¹ | Features 9–13: minutes and cost per feature | Time per feature | Range of 9–13 | Source lines added · removed (9–13) | Largest file, before → after |
| --- | --- | --- | --- | --- | --- | --- |
| A run 3 | 4.4 min · $1.18 | 4.6 min · $1.13 | **+5%** | 3.1–6.5 min | 1,307 · 53 | 414 → 521 lines |
| D run 2 | 3.8 min · $0.94 | 5.0 min · $1.17 | +32% | 3.0–7.4 min | 1,453 · 72 | 409 → 572 lines |
| P run 2 | 2.5 min · $0.41 | 3.3 min · $0.34 | +32% | 2.7–4.4 min | 264 · 13 | 308 → 482 lines |

¹ Features 2–7, since feature 1 also built the project. On features 9–13 each conversation starts fresh, so the cost per feature is lower than late in a long conversation. Time compares better than cost.

- **P was the soonest on four of the five features, and the cheapest on all five.** On search it was the slowest: 4.4 min, against 3.1 for A and 3.0 for D.
- **P's time per feature grew by a third, and so did D's; A's barely moved.** That is the shape the hypothesis predicted for P, but D shows it too, and A has one tree. On one tree per arm, it is a direction to measure over a longer horizon, not a finding.
- **The plain tree concentrates.** Its notes module grew from 308 to 482 lines, and P wrote 264 lines where A and D wrote 1,300–1,450. The aggregates of A and D grew too: `Note.ts` reached 521 and 572 lines.
- **Rewriting was small everywhere.** Features 9–13 removed 13–72 lines of existing code, against 264–1,453 added.
- **D's drift grew; A's cannot.** D2's tree had 20 refusals of the generated import rules in 10 files after the backlog. After five more features, it had 24 in 12. The new ones are in the account deletion's domain service and its test. They are the same two kinds as before: relative imports into a subdirectory, and Domain tests importing in-memory adapters. Still no production file crosses a boundary.

## E4 — Real persistence

One fresh agent per tree got one request: keep everything in SQLite at `DATABASE_PATH`. The hidden test does the following:
- starts the server as a separate process;
- writes through every feature;
- stops the server and starts it again on the same file;
- reads everything back;
- waits for a reminder written before the restart, then writes again.

| Tree | Hidden test | Features 1–7 afterwards | Active time | Cost | Source lines added · removed | Files touched | Storage chosen |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A run 2 | pass | no regression | 9.4 min | $2.15 | 381 · 40 | 27 | one JSON document per aggregate, a durable outbox |
| A run 3 | pass | no regression | 12.5 min | $3.67 | 950 · 20 | 28 | a table per aggregate, a durable outbox |
| D run 1 | pass | no regression | 12.5 min | $3.74 | 1,090 · 20 | 23 | a table per aggregate, a durable outbox |
| D run 2 | pass | no regression | 12.8 min | $2.95 | 394 · 23 | 17 | one JSON document per aggregate, a durable outbox |
| P run 2 | pass | no regression | **4.9 min** | **$1.00** | 208 · 11 | 9 | one JSON document per record |
| P run 3 | pass | no regression | **4.9 min** | **$0.90** | 209 · 25 | 9 | one JSON document per record |

- **The prediction on where the change lands held.** No architecture run touched a context's Domain or Application.
  - They changed the in-memory adapters, each context's wiring file, the composition root and the building blocks' data source, unit of work and outbox.
  - The plain runs changed the code of every module: storage is not apart from the rules there.
- **It did not make the change cheaper.** P was 1.9–2.6 times as fast as A and D and 2–4 times cheaper. It wrote 208–209 lines, against 381–1,090. P's range does not overlap theirs. A and D do not differ.
- **Within A and D, the cost followed a design choice.** Two runs chose a table per aggregate and wrote 950–1,090 lines. Two kept one JSON document per aggregate and wrote 381–394. The arm did not decide it. The architecture's real cost is visible in the cheap pair: 381–394 lines against P's 208–209, and 17–27 files against 9.
- **The architecture runs made their outbox durable,** in the same SQLite file and the same transaction as the state. The plain runs have no outbox, since they have no events to relay.
- **What the test does not exercise:** a crash between a commit and a publication, and two writers at once. The architecture's outbox and its optimistic concurrency exist for those, and a test of them would be the next experiment.

## What it says

**The control's conclusion stands under four more conditions.**
- On this application, with a strong or a weak model, over twelve features or one change of storage, the architecture did not make one agent deliver more, sooner or cheaper.
- P was the soonest and the cheapest in every experiment: 1.3–2.9 times sooner and 2–9 times cheaper.
- It delivered as much as A and D.

**What the architecture did buy, and what that is worth, is now measured rather than claimed:**
- **Locality of a change.** E4's storage change stayed in adapters and wiring, as the ports promise. A person who must review or own that change reads fewer kinds of file. These measurements cannot price that; a person can.
- **Holding the structure.** D's drift grew with the code; A's tooling keeps it at zero. If the structure is wanted, only the tooling held it exactly, over a longer horizon too.
- **Making a fan-out safe.** E2 shows the fan-out's speed is parallelism, and the architecture's contract is what lets the slices run in parallel without conflict.

**Is the tool relevant?**
- **For a single agent on an application of this size: no measurable benefit.** It holds the architecture exactly, and costs storms and bookkeeping.
- **It is relevant where the architecture is a requirement:** a team that has chosen Clean Architecture and DDD and wants agents to keep it. That is the drift D shows.
- **It is relevant for running agents in parallel,** which this benchmark shows is the one way the architecture made a feature land sooner.

**What still is not shown:**
- **A horizon of a real product's lifetime.** E3's direction, a plain tree's time per feature growing while A's stays flat, needs several trees and many more features to become a result.
- **Concurrency and crash recovery under test.**
- **People maintaining the code.**
- **Another model family.**

## Biases

- **Author of everything.** One author wrote the architecture, the features, their tests and their storms, and the author's own kit had three defects found while grading. All three are [recorded as amendments](benchmark/extensions/README.md#amendments) and applied to every tree.
- **Few runs.** E1, E2 and E4 have two runs per arm. E3 has one tree per arm.
- **The weaker model is the smallest of the same family.**
- **No reading this time.** Unlike the control, no independent reader judged these trees. Quality here is the hidden tests, the gate and the drift only.
- **Machine load.** Grading two trees while four agents ran made one test command time out twice: on E2-A2's features 1–7 and on E4-A3's gate. Both were graded again on a quiet machine and passed. The grades in the archive are the quiet ones.

## Cost

| | Reported |
| --- | --- |
| E1, six runs of the weaker model | $16.09 |
| E2, two runs | $16.77 |
| E3, three trees × five features | $13.22 |
| E4, six runs | $14.41 |
| **The extensions** | **about $60** |
