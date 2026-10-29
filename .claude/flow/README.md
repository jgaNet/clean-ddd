# Flow

The smallest driver of the clean-ddd reference's RFC 0001 (`docs/rfc/0001-architecture-aware-multi-agent-flow.md` there), phase 1: one feature, one agent in its own git worktree, one verdict from the gate, one log.

```bash
node .claude/flow/run-feature.mjs --project <dir> --base <ref> --request <file> --run <id> \
  [--model <id>] [--timeout-minutes 60] [--log <file.jsonl>]
```

- **The project** is an application `clean-ddd create` made, or any repository with `conventions/`. The run never touches its checkout: it adds a worktree under `<project>.flow/worktrees/<id>`, beside the project and not inside it (phase 1 found the project's own Jest walking worktrees placed inside), on a branch `run/<id>`, from the base, with its own hard-linked copy of the project's `node_modules` (phase 1 found three agents' `yarn add` writing into one shared, linked copy). The log is `<project>.flow/<id>.jsonl` unless `--log` says otherwise.
- **The agent** is Claude Code, headless (`claude -p … --output-format json`), given the request in product words and the project's own `.claude/agents/feature-author.md`, which tells it what it may change and that it is done when the gate says so.
- **The gate** is run by the driver on the worktree once the agent has stopped. Its verdict is the run's, whatever the agent reported.
- **The log** is JSONL, one event per line: `started`, `agent-finished` (exit code, turns, duration, and the cost and tokens per model **only as the runner reports them** — absent otherwise, never estimated), `gate` (the whole report), `finished`.

It is a script on purpose. It schedules nothing, runs one feature, and holds no state but the log; scheduling, several agents and resuming are later phases of the RFC, and come only if the measurements justify them.
