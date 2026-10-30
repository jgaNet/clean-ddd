# Flow

The smallest driver of the clean-ddd reference's RFC 0001 (`docs/rfc/0001-architecture-aware-multi-agent-flow.md` there), phases 1 to 3: one feature, one agent in its own git worktree, one verdict from the gate, one log — then one cross-context feature, one agent per bounded context in parallel, and one writer that integrates them — then a run that survives its driver, and a second runner.

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

The feature's contract is decided first, by a person, and committed (the contract stage): the storm, one feature plan per context, the integration contracts in the shared kernel, the relationship in the context map (declared `planned` until its code), the composition root's registration of a new context, and an acceptance test of the user-visible flow that only the integrated feature can pass. The execution plan then says how this run executes it — the base, the request, the storm, the slices with their plans, the acceptance test and the command that runs it, the model, the parallelism, the retry, the ports; its comment at the top of the script shows one.

- **The contract is held before anything starts:** the storm and every plan validate, and the acceptance test exists and fails at the base.
- **The slices run at once**, each in its own worktree (`<project>.flow/worktrees/<run>/<slice>`), with its own port, told the contract is frozen and that it may change its own context's folder and nothing else.
- **The driver's verdict per slice** is the gate, plus its scope: a file outside the slice's context is refused. A failure sends the slice back once, in the same conversation, with the lines to read; an agent whose report starts with `BLOCKED` stops the feature — the contract is a person's to change.
- **One writer integrates:** each slice's patch applied to a worktree from the base, the contract marked carried (the storm done, the plans' parts not new), the documents regenerated, then the gate, what the code still owes the storm, and the acceptance test. The integrated branch `run/<run>/integration-<n>` is what a person reviews and merges.

The log has the same shape as phase 1's, per slice, plus `contract`, `slice` (its state), `integration` and `finished`.

## Phase 3: interruption, cancellation, a second runner, the slice's pack

```bash
node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> [--runner claude-cli|claude-sdk]
node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> --resume    # after the driver died
node .claude/flow/run-slices.mjs --project <dir> --plan <execution-plan.yaml> --cancel    # stop a running driver
```

- **Runners** ([`runners.mjs`](runners.mjs)): the same task, the same answer, from Claude Code headless (`claude-cli`) or the Claude Agent SDK (`claude-sdk`, resolved from the project or from `CLAUDE_AGENT_SDK`, the package's directory). Name the model in the execution plan (`agent.model`): the runner's default may be one the account cannot use. A continued conversation reports its running total, so a slice's cost is the latest figure, never a sum.
- **Leases.** A running slice holds a lease beside its worktree (`<slice>.lease`: the driver, the agent's process group, refreshed every 30 s). A driver that dies leaves it behind.
- **Resume** folds the log. A slice that passed stays passed. One its driver lost is reclaimed: the agent that outlived the driver is stopped by its process group, and the agent continues the same conversation, told it was interrupted — a gate that passes on half a slice says the code is sound, not that the slice is done, so only a slice whose agent had finished is checked again rather than continued. An interrupted integration is redone in a new worktree. A finished run is left alone.
- **Cancel** signals the running driver (its pid is in `<run>.lock`): every agent is stopped, the running slices and the run are recorded `CANCELLED`, which is final.
- **The pack.** When the project's tooling has `clean-ddd pack`, each agent is told to start with it: its part of the feature, the files that show each shape (from the reference the package carries when the project has none yet), the other slices' parts, the frozen contracts.

The SDK's agent process is not in a process group of its own: if the driver is killed with SIGKILL while a `claude-sdk` slice runs, its agent may outlive it, and the lease, which has no group to name, cannot stop it. Cancel stops it through its abort signal; a crash does not.

## Phase 4 and after: the backlog, and the strategy logged

- **[`run-backlog.mjs`](run-backlog.mjs)** runs the benchmark's arms A (one agent, the features in order) and B (one agent per feature, in parallel); [`grade.mjs`](grade.mjs) grades any arm's final tree with one tooling; [`person.mjs`](person.mjs) logs the person's time in the contract stage.
- **The strategy, logged.** Each feature's log carries a `strategy` event: what `clean-ddd strategy` recommends for its storm (one agent or the fan-out by context), with its estimate and inputs, beside what the run actually does — so the rule of RFC phase 6 is evaluated against the runs it was asked about. The execution plan's `priority` (`cost` by default, or `time`) is what it weighs. Tooling older than the command logs nothing.

## Supervision: what lets agents run unattended

[`supervision.mjs`](supervision.mjs) holds what the robustness campaign waits for (ADR 31 of the clean-ddd reference; this directory is copied into every application `create` makes, so it links nothing outside itself). [`supervision.test.mjs`](supervision.test.mjs) tests each part without an agent (`yarn test:flow` at the root, and in CI).

- **Isolated dependencies.** Every worktree gets a copy of the project's `node_modules`, so an agent that writes into a package changes nothing another tree, or the project, sees. Before, the trees had hard links, and a file written in place was written in all of them. An execution plan may ask for `dependencies: link` when the disk is short. The driver then fingerprints the project's `node_modules` before each agent and after it, and a change fails the feature (`dependencies-changed`). The grader links, since it runs no agent.
- **A budget reserved before an agent starts.** `run-backlog.mjs` reserves the agent's share before starting it, and starts it with that share as a cap (`--max-budget-usd` on the CLI, `maxBudgetUsd` on the SDK). The share is `agentBudgetUsd`, or all that is left, and agents running at the same time hold their reservations. A run that cannot reserve the minimum starts no more agents. Before, the budget was checked after the fact, and one agent could spend past it.
- **A supervisor.** A runner says why it stopped an agent (`stoppedBy`: `timeout` or `cancel`). After every agent, the driver stops whatever still listens on the agent's port, with its process group (a watcher would start it again), and records what it stopped (`port-freed`). It finds them by the port, through `/proc`, never by name.

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

It is a script on purpose. It holds no state but the log (and, while it runs, a lock and the leases); several features at once is a later phase of the RFC, and comes only if the measurements justify it.
