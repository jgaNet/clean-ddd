# Flow

The smallest driver of the clean-ddd reference's RFC 0001 (`docs/rfc/0001-architecture-aware-multi-agent-flow.md` there), phases 1 to 3: one feature, one agent in its own git worktree, one verdict from the gate, one log — then one cross-context feature, one agent per bounded context in parallel, and the integrator that merges them — then a run that survives its driver, and a second runner.

```bash
node .claude/flow/run-feature.mjs --project <dir> --base <ref> --request <file> --run <id> \
  [--model <id>] [--timeout-minutes 60] [--log <file.jsonl>]
```

- **The project** is an application `clean-ddd create` made, or any repository with `conventions/`. The run never touches its checkout: it adds a worktree under `<project>.flow/worktrees/<id>`, beside the project and not inside it (phase 1 found the project's own Jest walking worktrees placed inside), on a branch `run/<id>`, from the base, with its own copy of the project's `node_modules` (phase 1 found three agents' `yarn add` writing into one shared, linked copy; see *Supervision* below). The log is `<project>.flow/<id>.jsonl` unless `--log` says otherwise.
- **The agent** is Claude Code, headless (`claude -p … --output-format json`), given the request in product words and the project's own `.claude/agents/feature-author.md`, which tells it what it may change and that it is done when the gate says so.
- **The gate** is run by the driver on the worktree once the agent has stopped. Its verdict is the run's, whatever the agent reported.
- **The log** is JSONL, one event per line: `started`, `agent-finished` (exit code, turns, duration, and the cost and tokens per model **only as the runner reports them** — absent otherwise, never estimated), `gate` (the whole report), `finished`.

## Phase 2: one feature, one agent per bounded context

```bash
node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> [--log <file.jsonl>]
```

The feature's contract is decided first, by a person, and committed (the contract stage): the storm, one feature plan per context, the integration contracts in the shared kernel, the relationship in the context map (declared `planned` until its code), the composition root's registration of a new context, and an acceptance test of the user-visible flow that only the integrated feature can pass. The execution plan then says how this run executes it — the base, the request, the storm, the slices with their plans, the feature's owner, the acceptance test and the command that runs it, the model, the parallelism, the retry, the integrator's rounds, the ports; its comment at the top of the script shows one.

- **The contract is held before anything starts:** the storm and every plan validate, and the acceptance test exists and fails at the base.
- **The slices run at once**, each in its own worktree (`<project>.flow/worktrees/<run>/<slice>`), with its own port, told the contract is frozen and that it may change its own context's folder and nothing else.
- **The driver's verdict per slice** is the gate, plus its scope: a file outside the slice's context is refused. A failure sends the slice back once, in the same conversation, with the lines to read; an agent whose report starts with `BLOCKED` stops the feature — the contract is a person's to change.
- **The integrator merges them** ([`integrator.mjs`](integrator.mjs), the same module the ladder's fan-out calls; see *Several agents on one feature* below). Its owners are the slices, each owning its context's folder; the feature's owner is the plan's `owner`, or the first slice. Each round:
  - a new integration worktree from the base, with each slice's patch applied, the feature's owner's last; a patch that does not apply is a conflict, sent to its slice;
  - the merged result held to what the single writer held it to: the contract marked carried (the storm done, the plans' parts not new), the documents regenerated, then the gate, what the code still owes the storm, and the acceptance test;
  - each failing step sent to the slice whose files it names, or to the feature's owner when it names none: the slice's conversation is continued in its worktree, and the slice is then held to its own verdict again, with its `retry.perSlice`. A slice that stops there (`BLOCKED`, or failed by its own verdict) stops the feature.

  After `integration.rounds` rounds (two), the merged result is judged as it stands, and `finished` says which failure was left and whose (`left`). The integrated branch `run/<run>/integration-<n>` is what a person reviews and merges.

The log has the same shape as phase 1's, per slice, plus `contract`, `slice` (its state), `integration` (each merge and each verdict on it), `integrator` (each round) and `finished`.

## Phase 3: interruption, cancellation, a second runner, the slice's pack

```bash
node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> [--runner claude-cli|claude-sdk|command]
node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> --resume    # after the driver died
node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> --cancel    # stop a running driver
```

- **Runners** ([`runners.mjs`](runners.mjs)): the same task, the same answer, from Claude Code headless (`claude-cli`) or the Claude Agent SDK (`claude-sdk`, resolved from the project or from `CLAUDE_AGENT_SDK`, the package's directory). Name the model in the execution plan (`agent.model`): the runner's default may be one the account cannot use. A continued conversation reports its running total, so a slice's cost is the latest figure, never a sum. `command` (with `agent.command`, as in the ladder) stands in for an agent to rehearse the driver without spending: it runs that shell command in the slice's worktree with the turn's prompt in `PROMPT`, and what it prints is its report. When an agent stops, for any reason, the runner kills what it left running in its directory (`reap`): a background command runs in a process group of its own and outlives the group kill.
- **Leases.** A running slice holds a lease beside its worktree (`<slice>.lease`: the driver, the agent's process group, refreshed every 30 s). A driver that dies leaves it behind.
- **Resume** folds the log. A slice that passed stays passed. One its driver lost is reclaimed: the agent that outlived the driver is stopped by its process group, and the agent continues the same conversation, told it was interrupted — a gate that passes on half a slice says the code is sound, not that the slice is done, so only a slice whose agent had finished is checked again rather than continued. An interrupted integration is redone in a new worktree, from its first round. A finished run is left alone.
- **Cancel** signals the running driver (its pid is in `<run>.lock`): every agent is stopped, the running slices and the run are recorded `CANCELLED`, which is final.
- **The pack.** When the project's tooling has `clean-ddd pack`, each agent is told to start with it: its part of the feature, the files that show each shape (from the reference the package carries when the project has none yet), the other slices' parts, the frozen contracts.

The SDK's agent process is not in a process group of its own: if the driver is killed with SIGKILL while a `claude-sdk` slice runs, its agent may outlive it, and the lease, which has no group to name, cannot stop it. Cancel stops it through its abort signal; a crash does not.

## Phase 4 and after: the backlog, and the strategy logged

- **[`run-backlog.mjs`](run-backlog.mjs)** runs the benchmark's arms A (one agent, the features in order) and B (one agent per feature, in parallel); [`grade.mjs`](grade.mjs) grades any arm's final tree with one tooling; [`person.mjs`](person.mjs) logs the person's time in the contract stage.
- **The strategy, logged.** Each feature's log carries a `strategy` event: what `clean-ddd strategy` recommends for its storm (one agent or the fan-out by context), with its estimate and inputs, beside what the run actually does — so the rule of RFC phase 6 is evaluated against the runs it was asked about. The execution plan's `priority` (`cost` by default, or `time`) is what it weighs. Tooling older than the command logs nothing.

## Supervision: what lets agents run unattended

[`supervision.mjs`](supervision.mjs) holds what the robustness campaign waits for (ADR 31 of the clean-ddd reference; this directory is copied into every application `create` makes, so it links nothing outside itself). [`supervision.test.mjs`](supervision.test.mjs) tests each part without an agent (`yarn test:flow` at the root, and in CI).

[`machine.mjs`](machine.mjs) holds what a ladder asks of the machine, so that two arms are not compared on two machines: it refuses to start on a Node older than the project's `engines.node` and puts its own Node first on the PATH of every command it runs, and it waits for one of `machine.ladders` slots (3 by default, `FLOW_LADDERS` overrides it) before it starts. OpenStay's J5 found both: trees that declare Node 24 ran on Node 22, where one tree's own test cannot load an ES module, and four ladders at once ran the machine out of memory. [`machine.test.mjs`](machine.test.mjs) tests it.

- **Isolated dependencies.** Every worktree gets a copy of the project's `node_modules`, so an agent that writes into a package changes nothing another tree, or the project, sees. Before, the trees had hard links, and a file written in place was written in all of them. An execution plan may ask for `dependencies: link` when the disk is short. The driver then fingerprints the project's `node_modules` before each agent and after it, and a change fails the feature (`dependencies-changed`). The grader links, since it runs no agent.
- **A budget reserved before an agent starts.** `run-backlog.mjs` reserves the agent's share before starting it, and starts it with that share as a cap (`--max-budget-usd` on the CLI, `maxBudgetUsd` on the SDK). The share is `agentBudgetUsd`, or all that is left, and agents running at the same time hold their reservations. A run that cannot reserve the minimum starts no more agents. Before, the budget was checked after the fact, and one agent could spend past it. The budget is the run's: `run-ladder.mjs`, resumed, counts what its earlier processes spent, read from the log (J5: before, each resume had the whole budget again).
- **A regression checked on the start.** With `regressionCheck: { from: n }` in a ladder's plan, an earlier feature that still fails an attempt after its replay is graded `n` times on the commit the attempt started from. One that fails there too was unstable before the attempt, and the attempt is not escalated for it: it delivers, with the feature named `unstable` for the triage (`regressions-on-from` keeps the gradings). Only what passed on the start is a regression. OpenStay's J5 escalated an attempt that had passed its own tests because an earlier test asked before a job had run (test 71). The option is off unless the plan says it, so a ladder resumed on a plan written before it keeps its rule. `regressionsAgainstFrom` in [`supervision.mjs`](supervision.mjs) decides, and is tested.
- **A supervisor.** A runner says why it stopped an agent (`stoppedBy`: `timeout` or `cancel`). After every agent, the driver stops whatever still listens on the agent's port, with its process group (a watcher would start it again), and records what it stopped (`port-freed`). It finds them by the port, through `/proc`, never by name.

## Several agents on one feature, and the integrator

- **The integrator** ([`integrator.mjs`](integrator.mjs), ADR 38 of the reference) is the role every run where several agents write one feature has. Each round, it:
  - merges every owner's branch onto the feature's start;
  - runs the gate on the merged result;
  - sends each failing step to the owner of a file it names, or to the feature's owner when it names none.

  It stops after two rounds. Git, the gate and the agents are passed in, and [`integrator.test.mjs`](integrator.test.mjs) tests the routing and the bound without them. Two drivers call it:
  - **the phase-2 fan-out** ([`run-slices.mjs`](run-slices.mjs)): the owners are the slices, a merge applies their patches to a new worktree from the base, and the gate is the contract marked carried, the gate, the storm's owing and the acceptance test (*Phase 2* above);
  - **the ladder's fan-out by context**, below.
- **The ladder's fan-out by context.** With `fanOut: { rounds: 2 }` in a clean arm's plan, a feature whose storm lists several contexts may be written by one agent per context, in parallel, each with the step's model.
  - **Whether it is split** (the next campaign's correction 12, in the reference's `docs/evaluations/benchmark/openstay/j5/next-campaign.md`):
    - with `split: recommended`, the default, only where `clean-ddd strategy` recommends it, asked with `priority` (`time` by default; with `cost` it never recommends a split, the fan-out costing more in every measured run);
    - with `split: always`, every such feature, as J5b registered it.

    The `strategy` event logs the recommendation, the priority and what the attempt ran.
  - **Ownership:**
    - The storm's first context owns the feature. Its agent owns its folder and everything no other agent owns (the composition root, the shared kernel, the conventions, the decisions).
    - Each other agent owns its context's folder and the integration events it publishes.
  - **The owners talk** through a channel (`channel say|wait|read`, on their `PATH`), and read each other's branches in the same repository.
  - **The contract comes first.** For each relationship of the storm between two owners, the brief says who does what:
    - the upstream owner writes the contract first (the integration event, or what the port reads), commits it and says so in the channel;
    - the downstream owner builds on it, writes no version of its own, and writes the relationship's test in its own context's end-to-end tests.
  - **An owner's verdict** is:
    - its scope (a file another owner owns is refused, unless it is that owner's own version, merged in);
    - the gate on its branch, without `--fix`, less what the owner cannot fix alone (correction 13):
      - the relationship tests, which only the merged feature can pass;
      - every failure that names a file or a module another owner owns (a member its integration events do not export yet, read through the binding's aliases). It waits on that owner: it is logged as `waiting` in the `owner-verdict` event, never sent back, and left to the integrator's gate on the merged result.

    With `ownerGate: false`, the gate is not run on an owner's branch at all: the verdict is the scope, and the integrator's gate is the only one.

    The owners' gates on one attempt take a lock, so their test suites do not run at once.
  - **The merged result** is held to the clean arm's verdict, checked once more alone if it fails, and graded like any attempt's head.
  - **The log** says who did what: `agent-finished` carries the `owner`, then come `owner-verdict`, `integrator` (each round) and `integrated`.
  - **A control before the triage.** A split feature that every step failed is written once more by one agent, with the last model.
    - If it delivers, the tree goes on. The split failed, not the tree, and the log says so: `control`, and `control: 'one agent'` on the delivery.
    - If it fails too, the triage follows as usual.
    - It runs once per feature, across resumes.
- **A tree that outlives the machine.** With `push: { remote, branch, logBranch }`:
  - after each delivery, escalation, triage and at the end, the tree's `main` is pushed to `branch`;
  - the run's log and its gradings are committed to `logBranch` (with git's plumbing, outside any worktree) and pushed.

  A failed push is logged (`publish-failed`) and the run goes on. OpenStay's J5 lost its trees and their logs with a machine.
- **The time one grading is given** is `gradeTimeoutMinutes` (60 by default): J5's largest tree needed more under load.

## Rehearsing a kit before its runs

Every campaign so far found defects in its own kit while grading, after the agents had been paid:
- files the trees' own checks refuse;
- a test that fails on every correct solution;
- an earlier feature's assertion that a later feature supersedes;
- a test no tree fails.

[`dry-run.mjs`](dry-run.mjs) rehearses a kit first, with no agent. The plan names trees that exist: the commit the runs would start from (`before`) and, when there is one, a commit where the features are written (`solved`). Each is graded by `grade.mjs`, one after the other. The verdict is `defect`, `read` or `clean`:

- **Hygiene.** The kit's files are held to the tree's own formatter, linter and type checker, which the agent's verdict runs over them. A refusal is a `defect`.
- **Discrimination.** A feature's test that passes on a `before` tree tests nothing there: `read`.
- **Solvability.** A test that fails on every solved tree, in more than one tree, is a `defect`. One that fails on some is `read`.
- **Regression.** With `regression:` (the kit of the features the trees already had), an earlier feature's test that passes before and fails on a solved tree is `read`: a regression, or an assertion a new feature supersedes.

[`dry-run.test.mjs`](dry-run.test.mjs) holds the verdict to the defects the earlier kits had. A kit is rehearsed before its campaign, and its report is committed with the kit. Run on the horizon kit as it was before its runs, it finds all three of that kit's amendments.

## Holding a kit to the standard before its runs

The rehearsal finds a test that is wrong. It does not find a convention that no test holds where it is born: OpenStay's
J5 and J5b paid three times for one, each found by a late request (a `503` at request 80, an operation's `error` at
61, a `payment` read `null` at 73). The kit standard (`docs/evaluations/benchmark/kit-standard.md` in the clean-ddd
reference) closes it, for a kit that opts in with `api/` and `conventions.yaml`:

```bash
node .claude/flow/kit-check.mjs <kit>     # before the campaign is registered, beside dry-run.mjs
```

- **[`api-schema.mjs`](api-schema.mjs)** composes the kit's fragments (`api/<n>-<id>.yaml`: JSON Schema for each
  route's answers and the resources they add or change, the states they add, the fields `null` in one case only) up to
  a request, and validates an answer against the composition; each problem names the request whose fragment set the
  shape.
- **[`kit-check.mjs`](kit-check.mjs)** refuses a request with an API table and no fragment, a convention of the
  register without `born` or without its `it` in that request's acceptance file, a state added without a test that
  reads the whole resource in it, and an operation the requests compose that differs from the contract's
  (`http.operation`) without a decision in request 1. It prints the findings and exits non-zero on any.
- **`grade.mjs`**, for a kit with `api/`, writes the API composed up to `--upto` beside the hidden tests
  (`api-schema.json`) and gives its path in `API_SCHEMA`, so the kit's client validates every answer it reads. A kit
  without `api/` is graded as before.

[`kit-check.test.mjs`](kit-check.test.mjs) builds a kit of three requests in a temp dir, shows each refusal, and the
composed API catching the three conventions OpenStay's trees broke.

It is a script on purpose. It holds no state but the log (and, while it runs, a lock and the leases); several features at once is a later phase of the RFC, and comes only if the measurements justify it.
