# OpenStay's J4: its runs, as they ran

J4 ([the kit](../../benchmark/openstay/j4/README.md), [the protocol](../../benchmark/openstay/README.md)) ran from 2026-11-02 to 2026-11-03: J3's six trees through the defect report 25.1 and requests 26 to 50, four at a time. Every file here is redacted: the models are named by their step on the ladder (`smallest`, `intermediate`, `strongest`), and local paths start at `/runs`.

| File | What it holds |
| --- | --- |
| `<tree>.jsonl` | The run's log ([`run-ladder.mjs`](../../../../.claude/flow/run-ladder.mjs)): each attempt with its model, its step and the size of the tree it started from; the agent's report, cost, time and turns; each replay of a failing test; each escalation with its reason and the head it left; each delivery; each stop and resume. An agent sent back by the gate reports its session's cost, so the cost of a continued run includes the run before it ([the record](../../2026-11-03-openstay-j4.md#cost)). |
| `plan-<tree>.yaml` | The plan each tree was started from. |
| `per-feature.json` | Each feature's cost (each agent counted once), agent time, attempts and the step it was delivered at, per tree. |
| `grade-<tree>.json` | The second grading of each final tree, one tree at a time on a quiet machine: every feature's hidden test, 1 to 50 and 25.1. |
| [`escalations.md`](escalations.md) | Every escalation, checked against the kit as it happened, and every incident (amendments, harness defects, container restarts, full disks, the interference between trees), with what was done about it. |
| [`findings.md`](findings.md) | What was noticed in the trees during the runs, for the reading and the record, corrections included. |
| [`reading/`](reading) | The independent reading of the six final trees against [the rubric](../../benchmark/openstay/j4/reading.md): the readers' brief and their three reports, one per group of items. |
| `trees/<tree>.bundle` | Every J4 attempt's branch, the attempts kept aside when a run was stopped (`refs/amend2`, `refs/amend3`, `refs/rebase`, `refs/timeout`, `refs/diskfull`), and the final `main`, from the tree's J3 head. It applies on top of J3's bundles ([`../openstay-j3/trees/`](../openstay-j3/trees)). The final trees are also branches of the product repository, `trees/<tree>`. |

[The record](../../2026-11-03-openstay-j4.md) says what they found.
