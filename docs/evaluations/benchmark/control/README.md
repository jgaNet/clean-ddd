# The control: the same backlog without the architecture, and without its tooling

Phase 4 compared ways of staffing agents. In every arm, the agents had the same architecture (Clean Architecture and DDD) and its tooling (`clean-ddd`: the contract, the generated import rules, the gate, the storms, the context map). So it says nothing about two questions:

1. **Does the architecture help an agent deliver?** Compared with the same agent on an ordinary project.
2. **Does the tooling help, beyond the architecture?** Compared with the same architecture, given as prose, with nothing to hold the code to it.

This kit answers them with two control arms. It was written and committed **before any control run**, like the backlog's kit.

## The arms

| Arm | The project it starts from | What the agent is given | The driver's verdict, one retry |
| --- | --- | --- | --- |
| **A** — architecture and tooling | `clean-ddd create` (phase 4's three runs: the pilot, runs 2 and 3) | The request and its storm | The gate in the architecture mode, and the storm |
| **D** — architecture, no tooling | `clean-ddd create`, with the tooling taken out ([`control.mjs prose`](../../../../.claude/flow/control.mjs)): no `conventions/`, no generated import rules, no CLI, no skills or agent definition; the guide is [`prose/CLAUDE.md`](prose/CLAUDE.md), the contract's layers and rules in words | The request | `yarn verify`: typecheck, lint, format, tests |
| **P** — plain | [`plain/`](plain): the same toolchain (TypeScript strict, ESLint, Prettier, Jest, Fastify), an empty `createApplication()`, a six-line guide | The request | `yarn verify` |

Everything else is A's protocol ([the benchmark](../README.md)):

- **The same backlog.** The same seven requests, word for word, each with its API.
- **The same agent.** One conversation takes the features in order, with the same model and the same runner.
- **The same driver.** [`run-backlog.mjs`](../../../../.claude/flow/run-backlog.mjs) runs arms P and D.
- **The same budget.** $40 a run.
- **The same hidden acceptance tests.** They are black-box tests over HTTP, never shown to any agent. For P they run beside a support that starts `src/app.ts` instead of the composition root; nothing else in them changes.

**Runs.** Three of P and two of D, run two at a time on the same four-CPU machine. The A runs are phase 4's own. They ran earlier the same day, under the same pairing, from the same tooling.

**Then a change.** One P tree and one D tree each take feature 8, team spaces ([its kit](../feature-8/README.md)), in a continued conversation, as A's pilot tree did. It is the largest change of the benchmark: it touches six contexts, and three of them are new.

## What is measured

The same measures for every arm:

- **Delivery.** Each feature's hidden acceptance test on the final tree (M2). The project's own checks (M1: A's gate; `yarn verify` for D and P). After feature 8, the regression of features 1 to 7.
- **Time and cost.** The lead time and the reported cost, per feature and in total. Feature 1 is also reported apart: P must write the asynchronous command protocol (`202`, then the operation followed at the tracker) that A and D find in their created project.
- **What was written** ([`tree-metrics.mjs`](../../../../.claude/flow/tree-metrics.mjs)): from the diff against the created commit, the lines added and removed in source and in tests, and the files touched; in the final tree, the test cases, the source files and the largest one. These numbers are descriptive and grade nothing.
- **The architecture without its tooling (D only).** After the run, the import rules the tooling would have generated are run on D's tree, with every context it grew declared. The refusals they would have raised are counted, and a sample is kept.
- **How the change landed (feature 8).** Pass or fail, the regressions, the time, the cost, and the lines removed from what existed before it.

## How a difference is read, decided now

- **An acceptance failure counts as a failure,** whatever the arm.
- **Time, cost and the counts:** two arms differ only when the ranges of their runs do not overlap. The ranges are A's three runs, P's three and D's two. Otherwise the record says *no difference shown*, not *the same*.
- **Feature 8 is one run per arm.** It shows a direction, never a result.

## Predictions, written before the runs

- **P delivers most features**, perhaps all: the requests are precise, with their API, and models write such services well. P is **cheaper and sooner on features 2 to 7**, since its agent reads less before it writes. Feature 1 costs P more than it costs A.
- **D delivers like A.** D's import-rule refusals are above zero: with nothing to hold them, some boundaries are crossed.
- **Feature 8** separates the arms more than the backlog does, if anything does. If the architecture pays, it is here: fewer lines rewritten, fewer regressions. If it does not, P absorbs it as cheaply.

If P matches A on delivery and is cheaper and sooner, the honest reading is that, on this backlog, the architecture does not help an agent deliver. Its value would then have to be shown elsewhere: in a larger change, in a fan-out, or for the people who read the code.

## Biases, written down now

- **The kit was written for the architecture.** The API's asynchronous protocol comes from it, and the acceptance tests, written by the architecture's author, follow it. P must build that protocol, and that cost is reported apart.
- **The acceptance tests are black-box.** They grade what a client sees. They cannot see whether a password is hashed, or where a rule lives.
- **The prose guide is the contract's own words.** A guide written for prose from the start might teach better.
- **One grader**, who wrote the architecture.

## Amendment, before the counted runs

The first two runs, P1 and D1, were interrupted twelve minutes in when the container restarted. Their logs showed a defect in this kit. The script the guides and the driver called `check` is shadowed in Yarn 1 by its built-in `yarn check`, which only verifies the installed dependencies. So the agents and the driver's verdict ran no typecheck, no lint and no tests.

The script is now `verify` (`yarn verify`), in both scaffolds, both guides, the driver and the grader. Nothing else changed. The two interrupted runs are discarded and counted in the cost; the runs counted start after this amendment.
