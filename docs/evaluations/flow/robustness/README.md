# The robustness campaign: its trees, its runs and its grades

The [campaign's protocol](../../benchmark/robustness/README.md) was written before the runs, and [the record](../../2026-10-31-flow-robustness.md) says what they found. This directory keeps what they started from, so that they can run again in any container from exactly the trees the starting point was graded on, and what they produced.

## The trees

Each tree is a git bundle of one tree from [the extensions' E4](../../2026-10-30-flow-extensions.md#e4--real-persistence): the application after the seven-feature backlog and the move to SQLite, with its whole history.

| Bundle | Arm | Head | What the head is |
| --- | --- | --- | --- |
| [`a2.bundle`](trees/a2.bundle) | A | `f3ddb77` | E4's tree, plus the `clean-ddd` 0.2.0 tooling (`gate --fix`), vendored in `vendor/` |
| [`a3.bundle`](trees/a3.bundle) | A | `b6ef284` | the same |
| [`d1.bundle`](trees/d1.bundle) | D | `76fdcb7` | E4's tree |
| [`d2.bundle`](trees/d2.bundle) | D | `bf24ddd` | E4's tree |
| [`p2.bundle`](trees/p2.bundle) | P | `34c95e5` | E4's tree |
| [`p3.bundle`](trees/p3.bundle) | P | `d7a742d` | E4's tree |

**Why the A heads differ.** The A trees' only commit after E4 upgrades their tooling package to 0.2.0, so that the agent's gate does the bookkeeping itself ([ADR 31](../../../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md)). The package is vendored so that the tree installs anywhere. The gate passes on that head.

**Restoring a tree:**

```bash
git clone -b main docs/evaluations/flow/robustness/trees/a2.bundle /somewhere/a2/app
cd /somewhere/a2/app && yarn install
```

The campaign's runs start from `main` as restored.

## The starting point

`base-<tree>.json` holds the grader's verdict on each tree, as it is, against the campaign's kit. Each file is redacted: no model name, no local path. The protocol gives the table and what it shows:
- two A trees lose notices under a crash;
- one tree of six keeps every change across two processes;
- no tree has the drill or the outside service yet.

The two-process figures were measured on their own, after the first grading, as the protocol says.

## The runs and their grades

Every file is redacted: the model is `main` (and `helper` for the runner's own small calls), and local paths start at `/runs`.

| File | What it holds |
| --- | --- |
| [`dry-run.json`](dry-run.json) | The kit rehearsed on the six trees before the runs ([`dry-run.mjs`](../../../../.claude/flow/dry-run.mjs)): read, not defective. |
| `plan-<tree>.yaml` | The plan each run was started from: the arm, the kit, a budget of $20 per run and $12 per agent, its own copy of the dependencies. |
| `<tree>.jsonl` | The run's log: each request's start, the agent's report, cost, time and turns, the gate or `yarn verify`, the end. |
| `grade-<tree>-1.json`, `grade-<tree>-2.json` | Requests 15–17 graded twice, with the amended kit: the verdicts the record counts. |
| `grade-<tree>-before-amendment-1.json`, `-2.json` | The first grading, with the kit as written. |
| `refusals-<tree>.txt` | Request 16's hidden test run on its own: how many of twenty simultaneous changes were refused. |
| `grade-<tree>-1to7.json`, `grade-<tree>-persist.json` | Features 1–7 and 14 after the campaign, for regressions. |
| `metrics-<tree>.json` | What the campaign wrote, from the starting head to the run's head ([`tree-metrics.mjs`](../../../../.claude/flow/tree-metrics.mjs)). |
| [`audit.json`](audit.json) | The [security audit](../../benchmark/security/README.md), every tree before and after the campaign. |
| [`reading.md`](reading.md) | The independent reading of the six changes. |

**The runs' trees.** `trees/<tree>-campaign.bundle` holds the agent's three commits, from the starting head to the run's head. It applies on top of the starting bundle:

```bash
trees=$PWD/docs/evaluations/flow/robustness/trees
git clone -b main $trees/a3.bundle /somewhere/a3/app
cd /somewhere/a3/app && git pull --ff-only $trees/a3-campaign.bundle main
```
