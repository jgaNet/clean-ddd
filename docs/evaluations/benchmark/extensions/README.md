# What the control could not show: four more experiments

[The control](../../2026-10-30-flow-control.md) found that, on the seven-feature backlog with a strong model, Clean Architecture and DDD did not improve one agent's development. It named five things it could not show. This kit tests four of them; the fifth, people maintaining the code, needs people. Each experiment is written here before it runs, with its prediction, and keeps the control's rules:

- **The same driver and grader.**
- **Hidden acceptance tests no agent sees.**
- **No difference without separate ranges.** Two arms differ only when the ranges of their runs do not overlap.
- **Every defect of the kit recorded as an amendment.**

## E1 — A weaker model

**Hypothesis.** The literature finds that architecture documentation helps weaker models most. If the architecture pays anywhere on this backlog, it pays for a weaker model.

**Runs.** Arms A, D and P, exactly as in the control, with the smallest model of the same family, named in each execution plan. Two runs per arm.

**Measures.** Features passing the hidden tests, time, cost, lines written. For D, the import rules the tooling would have generated.

**Prediction.** P is still cheaper. Two outcomes are possible, and either one decides:
- If A or D pass more features than P, the architecture helps a weaker model deliver.
- If they pass fewer, its weight costs a weaker model, as "constraint decay" found.

## E2 — One agent with the fan-out's contract (A+)

**Hypothesis.** On feature 8, the fan-out C′ was 21% sooner than A. But C′ also had a contract stage: plans per context, frozen events and read models, and the acceptance test. A did not. The gain might come from the contract, not from the parallelism.

**Runs.** One agent, on the same project C′ started from: the pilot's A tree after C′'s architecture task and contract stage, at commit `160856f`. It is given what each slice had, all at once:
- the request;
- the storm;
- the six plans;
- the frozen contracts;
- the acceptance test, which it may run.

Two runs.

**Measures.** Active time, cost, feature 8's tests, regression of features 1–7.

**Prediction.** A+ is cheaper than C′ and close to it in time. If A+ is as soon as C′, the contract carried the gain and the parallelism did not.

## E3 — A longer horizon

**Hypothesis.** Architectural decay grows with code size. A plain tree may cost more per feature as it grows, where a layered one stays flat.

**Runs.** Five more features, 9 to 13 ([`horizon/backlog/`](horizon/backlog)), each with a hidden acceptance test ([`horizon/acceptance/`](horizon/acceptance)) and a storm for arm A ([`horizon/storms/`](horizon/storms)). They are taken in order, in one conversation, on one finished backlog tree of each arm:
- A: run 3;
- D: run 2;
- P: run 2.

The features change what is already there, they do not merely add to it:
- comments on a note;
- a note's history, with a restore;
- editors on a shared note;
- deleting an account;
- full-text search.

**Measures.**
- **Per feature:** time and cost, against the same tree's features 1–7.
- **At the end:** all twelve acceptance tests, to catch regressions.
- **What each feature rewrote:** the lines removed from code that existed before it.

**Prediction.** If P's cost per feature rises with its size while A's and D's stay flat, the architecture pays over a horizon. If P stays flat, this horizon is still too short to show it.

## E4 — Real persistence

**Hypothesis.** The architecture's ports and adapters exist so that storage can change in one place. Every adapter in the backlog is in memory, so that promise was never tested.

**Runs.** One feature, [`persistence`](persist/backlog/14-persist.md), with its hidden test in [`persist/acceptance/`](persist/acceptance): everything survives a restart, in SQLite at `DATABASE_PATH`. It runs on two finished backlog trees of each arm, one fresh agent each:
- A: runs 2 and 3;
- D: runs 1 and 2, the first at its backlog head;
- P: runs 2 and 3.

**Measures.**
- **The hidden test:** it starts the server as a separate process, writes through every feature, stops it, starts it again on the same file, and reads everything back.
- **Regression of features 1–7.**
- **Time and cost.**
- **What the change touched:** files, and lines removed from what existed.

**Prediction.** The architecture arms change only adapters and the composition root. Whether that is cheaper than P's change is the question.

## Biases, written down now

- **Author of everything.** The same author wrote the architecture, these features, their tests and their storms.
- **Sample size.** E2 and E1 have two runs per arm. E3 has one tree per arm; E4 has two.
- **The longer horizon is still short.** Twelve features are not a product's lifetime.
- **The weaker model is the family's smallest.** A different family might behave differently.

## Amendments

Defects of the kit found while grading, fixed before any tree was graded with the fixed version, and applied to every tree alike.

1. **The hidden tests failed the project's own gate.** The project's typecheck, linter and formatter run over the hidden tests once they are copied in, and the first version of the horizon tests had an unused variable and lines the formatter rewraps. Measure M1 failed on the kit, not on the agent's code. The tests are now formatted with the project's formatter configuration and have no unused variable; no assertion changed.
2. **The deletion test followed its outcome with the token it deletes.** `12-delete-account` waited for the deletion's operation to succeed, reading it with the deleted account's token. Once the account is gone that token no longer reads anything, so a correct deletion looked like an operation that never ended. The test now checks that the deletion is accepted (202), then waits until the deleted account's token is refused (403), which is the outcome the feature asks for.
3. **Feature 11 changes a rule feature 4's test still holds.** E3 checks features 1–7 for regressions with their own hidden tests. But [`11-editors`](horizon/backlog/11-editors.md) says that sharing again with the same account changes the role, where feature 4 refused it, and feature 4's test still asserts the refusal. A tree that follows feature 11 can fail that one assertion without regressing. In E3's regression check, that assertion does not count: a tree that fails only it is rerun without it, and both results are recorded.
