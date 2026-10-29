# Flow

The smallest driver of the clean-ddd reference's RFC 0001 (`docs/rfc/0001-architecture-aware-multi-agent-flow.md` there), phases 1 and 2: one feature, one agent in its own git worktree, one verdict from the gate, one log — then one cross-context feature, one agent per bounded context in parallel, and one writer that integrates them.

```bash
node .claude/flow/run-feature.mjs --project <dir> --base <ref> --request <file> --run <id> \
  [--model <id>] [--timeout-minutes 60] [--log <file.jsonl>]
```

- **The project** is an application `clean-ddd create` made, or any repository with `conventions/`. The run never touches its checkout: it adds a worktree under `<project>.flow/worktrees/<id>`, beside the project and not inside it (phase 1 found the project's own Jest walking worktrees placed inside), on a branch `run/<id>`, from the base, with its own hard-linked copy of the project's `node_modules` (phase 1 found three agents' `yarn add` writing into one shared, linked copy). The log is `<project>.flow/<id>.jsonl` unless `--log` says otherwise.
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

It is a script on purpose. It holds no state but the log; resuming a run, a second runner and several features at once are later phases of the RFC, and come only if the measurements justify them.
