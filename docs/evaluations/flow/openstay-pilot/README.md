# OpenStay's pilot: its runs, as they ran

The pilot ([the kit](../../benchmark/openstay/pilot/README.md), [the protocol](../../benchmark/openstay/README.md)) ran on 2026-11-01: eight trees through the ten requests, four at a time. Every file here is redacted: the models are named by their step on the ladder (`smallest`, `intermediate`, `strongest`), and local paths start at `/runs`.

| File | What it holds |
| --- | --- |
| `<tree>.jsonl` | The run's log ([`run-ladder.mjs`](../../../../.claude/flow/run-ladder.mjs)): each attempt with its model, its step and the size of the tree it started from; the agent's report, cost, time and turns; each escalation with its reason and the head it left; each delivery. |
| `plan-<tree>.yaml` | The plan each tree was started from. |
| `metrics-<tree>.json` | What the run wrote, from its starting commit to its head ([`tree-metrics.mjs`](../../../../.claude/flow/tree-metrics.mjs)). |
| `per-feature.json` | Each feature's cost (every step's attempts) and time (from its start to its delivery, grading included), per tree. |
| `trees/<tree>.bundle` | Every attempt's branch and the final `main`, from the starting commit. It applies on top of the kit's starting bundles ([`../../benchmark/openstay/pilot/trees/`](../../benchmark/openstay/pilot/trees)). |

The record, with the second grading of every final tree and the independent reading, follows once both are done.
