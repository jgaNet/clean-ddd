# OpenStay's J3: its runs, as they ran

J3 ([the kit](../../benchmark/openstay/j3/README.md), [the protocol](../../benchmark/openstay/README.md)) ran on 2026-11-01 and 2026-11-02: the pilot's six trees through requests 11 to 25, four at a time. Every file here is redacted: the models are named by their step on the ladder (`smallest`, `intermediate`, `strongest`), and local paths start at `/runs`.

| File | What it holds |
| --- | --- |
| `<tree>.jsonl` | The run's log ([`run-ladder.mjs`](../../../../.claude/flow/run-ladder.mjs)): each attempt with its model, its step and the size of the tree it started from; the agent's report, cost, time and turns; each escalation with its reason and the head it left; each delivery. |
| `plan-<tree>.yaml` | The plan each tree was started from. |
| `metrics-<tree>.json` | What J3 wrote, from the tree's J3 starting commit to its head ([`tree-metrics.mjs`](../../../../.claude/flow/tree-metrics.mjs)). |
| `per-feature.json` | Each feature's cost and agent time (every step's attempts), per tree. |
| `grade-<tree>.json` | The second grading of each final tree, one tree at a time on a quiet machine: every feature's hidden test, 1 to 25, the chaos test a second time. |
| `trees/<tree>.bundle` | Every J3 attempt's branch and the final `main`, from the tree's pilot head. It applies on top of the pilot's bundles ([`../openstay-pilot/trees/`](../openstay-pilot/trees)). The final trees are also branches of the product repository, `trees/<tree>`. |
| [`reading.md`](reading.md) | The independent reading of the six final trees, against [the rubric](../../benchmark/openstay/j3/reading.md). |

[The record](../../2026-11-02-openstay-j3.md) says what they found.
