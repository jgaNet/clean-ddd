# The benchmark of RFC 0001, phase 4

[RFC 0001](../../rfc/0001-architecture-aware-multi-agent-flow.md) §10 asks whether several agents, coordinated by the architecture, deliver a real backlog sooner than one agent, at an accepted cost, with the same quality. This directory holds what every run of every arm is given and graded by. All of it was written and committed **before the first run**. A run never changes it; a defect found in it during a run is fixed here, said in the record, and re-graded on every arm's tree.

| | |
| --- | --- |
| [`backlog/`](backlog) | The seven features in product words, each with the API it answers. |
| [`storms/`](storms) | One storm per feature, its hot spots decided by the maintainer (2026-10-30) or carried from an earlier decision. |
| [`acceptance/`](acceptance) | One black-box acceptance test per feature, over HTTP, against the application's composition root, and the support they share. |
| [`rubric.md`](rubric.md) | What makes a feature pass, and what is measured. |

## The backlog

| # | Feature | Contexts | Needs first |
| --- | --- | --- | --- |
| 1 | Accounts and notes | Accounts, Notes (new) | two contexts declared, the composition root |
| 2 | Pin a note | Notes | 1 |
| 3 | Tags on a note | Notes | 1 |
| 4 | Share a note | Notes, asking Accounts | 1; the relationship Accounts → Notes |
| 5 | Notify recipients when a shared note is archived | Notes → Notifications (new) | 4; the Notifications context, the relationship Notes → Notifications |
| 6 | A plan and a ten-note quota | Plans (new), asked by Notes | 1; the Plans context, the relationship Plans → Notes |
| 7 | Remind a note at a time | Notes → Notifications | 5 |

This is the RFC's backlog, with one change: feature 1 brings accounts as well as notes. Without accounts, a note has no owner, and every later feature is written for "a signed-in account". So the Security context the RFC places at feature 4 is `Accounts`, at feature 1. Feature 4 needs only the relationship.

The feature dependencies are the "needs first" column: `1 → 2, 3, 4, 6`, `4 → 5`, `5 → 7`.

## The arms

Every arm:

- starts from `clean-ddd create --language typescript`, from this branch's package, in a directory of its own;
- uses the same model, named in the execution plan, through the same runner (Claude Code headless);
- has a budget ceiling of $40 a run, reported cost. Past it, the run stops, and a run that stops is a failure.

Every feature an arm delivers is graded by the same rubric, by the same grader, on the arm's final tree.

| Arm | What runs | Who does an architecture task |
| --- | --- | --- |
| **A — one agent** | One conversation takes the features in order: the request and its storm, then the gate, with one retry on the gate's lines. | The agent, in architecture mode: the gate holds it to `--mode architecture` when the change touches the architecture. |
| **B — naive parallel** | One agent per feature, each in its own worktree from the integrated head of when it starts. As many at once as the parallelism allows (3), a feature starting once the features it needs are integrated. No contract stage, no conflict keys. Each feature gets its request and its storm. | Each feature's agent, as in A. |
| **C — architecture-aware** | Features in order. For each, the person does the architecture task first, then the contract stage: the storm, a plan per slice, the frozen integration event, and the feature's acceptance test, red. Then one slice per context, in parallel, then the single writer. The agents are told to read the guide. | The person, timed. |
| **C′ — with the pack** | C, with each agent told to start from `clean-ddd pack`. | The person, timed. |

**The integrator.** B, C and C′ share one integrator. Every feature's patches are applied to the integrated head, then the integrator regenerates what the project generates and runs the gate on the combination. C and C′ also run the feature's acceptance test there.

A feature that fails integration is sent back once:

- A git conflict, in B, comes back to its agent with the current head merged into its worktree.
- Any other failure comes back with the failing lines.

A second failure fails the feature.

**The person** in C and C′ is the assistant that runs the benchmark, playing the role phase 2 gave it. Its time on each architecture task and each contract stage is logged, start and end, in the run's log, and counted against the arm.

## What is measured

Per run:

- **Lead time:** from the first agent started to the last feature integrated, wall-clock.
- **Person time:** in C and C′ only.
- **Agent time:** the sum over agents.
- **Reported cost:** the sum over agents, with every agent that reported nothing listed as absent, never estimated.
- **Process counts:** retries, integration failures by kind (git, architectural, contract, regression, behavioural), and interventions — a feature BLOCKED that needed the person.

Per feature, the rubric's verdict.

The pilot is one run per arm. It proves the harness, the kit and the rubric on the whole backlog; the maintainer then decides whether to run the other two runs per arm. A pilot's numbers are single points, not ranges, and the record says so.

## Biases, written down before the first run

- **The backlog mirrors this reference's history**, which a model may have seen. Every run starts from a created project, never a clone.
- **The grader wrote the guides, the kit and the acceptance tests.** A second grader reads a sample once the campaign is decided.
- **The person in C and C′ is an agent**, and its time is not a person's time. It is counted all the same, as the RFC asks; a person would be slower to read and faster to decide.
- **The arms share one machine (4 CPUs).** Runs that overlap slow each other's gates and tests, so the lead times are read with the record of what overlapped.
- **The acceptance tests are seen only by C and C′**, in their contract stage, because that is what the contract stage is. A and B meet them at grading.
