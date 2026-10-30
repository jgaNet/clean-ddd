# The robustness campaign: failures and concurrency, under the same requirements for every arm

[ADR 31](../../../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) puts this campaign first. The architecture's outbox, inbox, reactions in their own transaction and version check exist for crashes and concurrent writers, and no hidden test had exercised them. This is the one place where the architecture could still be shown to buy correctness rather than only locality.

This kit is written before any run, like [the control](../control/README.md) and [the extensions](../extensions/README.md). It keeps their rules:
- **The same driver and grader.**
- **Hidden tests no agent sees.**
- **No difference without separate ranges.**
- **Every defect of the kit recorded as an amendment.**

## The requirements

Three requests, in product words, the same for every arm. A request says what must hold, never how, so the plain arm has to build each guarantee itself.

| # | Request | What its hidden test does |
| --- | --- | --- |
| 15 | [Notices survive a crash](backlog/15-durable-notices.md) | **The drill:** the server dies right after recording an archiving (`FAULT_DRILL=after-archive`). After a restart, each recipient must be told once, and still once after another restart. **The chaos:** twelve archivings, each followed by a kill at a random delay of 0–40 ms from a fixed seed. After all restarts, a note that was archived must have told its recipient exactly once, and one that was not archived, never. |
| 16 | [Changes that arrive at the same moment](backlog/16-concurrent-changes.md) | Twenty shares of one note are sent at once to one process, and again split across two processes on one database file. Ten rounds send an edit and a share together. Every change reported as done must be kept and read the same by both processes. A refused change must change nothing. The number of refusals is recorded beside the verdict. |
| 17 | [An outside notification service](backlog/17-notification-service.md) | A service the test plays refuses each notification three times, then accepts it. Every notification must reach it, with the same body on each attempt, and never again once accepted. A notification still unaccepted when the server is killed must be accepted after the restart. |

The tests start the server as a process of their own, on a SQLite file, and kill its whole process group the way a power cut would ([`acceptance/robustness.ts`](acceptance/robustness.ts)). They depend only on the API and on three environment variables the requests name: `DATABASE_PATH`, `FAULT_DRILL` and `NOTIFY_URL`.

The two-process case was added after the first starting point was graded: inside one process, Node and a synchronous SQLite driver serialise every write, so twenty writes at once never contended and every tree passed. Contention between writers, which the version check exists for, needs two processes.

## The trees and the runs

**The trees.** The campaign starts from the six trees of the extensions' [E4](../../2026-10-30-flow-extensions.md#e4--real-persistence), which already keep everything in SQLite: A runs 2 and 3, D runs 1 and 2, P runs 2 and 3. A crash can only be tested on a tree that survives a restart.

**The runs.** One fresh agent per tree takes the three requests in order, in one conversation, as in E3, under its arm's driver: the gate and the tooling for A, `yarn verify` for D and P. The requests are non-functional, so they come with no storm.

**The starting point.** Before any run, each tree was graded on this kit as it is. That shows which guarantees already hold and which the agent must build.

| Tree | 15, drill | 15, chaos | 16, one process | 16, two processes | 17, the service |
| --- | --- | --- | --- | --- | --- |
| A run 2 | ✗ no drill | ✗ 2 of 12 archivings never told | ✓ 0 refused | ✗ a share answered 500 | ✗ nothing sent |
| A run 3 | ✗ no drill | ✓ | ✓ 0 refused | ✗ an operation never ended | ✗ nothing sent |
| D run 1 | ✗ no drill | ✗ 1 of 12 archivings never told | ✓ 0 refused | ✓ 0 refused | ✗ nothing sent |
| D run 2 | ✗ no drill | ✓ | ✓ 0 refused | ✗ the second process does not know an account the first created | ✗ nothing sent |
| P run 2 | ✗ no drill | ✓ | ✓ 0 refused | ✗ the same | ✗ nothing sent |
| P run 3 | ✗ no drill | ✓ | ✓ 0 refused | ✗ the same | ✗ nothing sent |

- **Two architecture trees lose notices under a crash, although their outbox is in SQLite.** They record an archiving and never tell its recipient. Neither plain tree did, in one sample each.
- **One tree of six passes across two processes:** D run 1.

## Four scores, kept apart

| Score | Measured by |
| --- | --- |
| Functional correctness | The hidden tests of features 1–7 and 14 after the campaign, to catch regressions |
| Robustness | The hidden tests of features 15–17, and the refusals that feature 16 records |
| Maintainability | An independent reading, against the control's [rubric](../control/reading.md), of what the campaign changed |
| Cost of change | Active time, reported cost, source lines added and removed, and files touched, per request |

Passing the acceptance tests says nothing about the other three, and a result says which score it moves.

## Before the runs: a hardened harness

The campaign runs agents unattended, so three changes come first, each with a test. They are in [`.claude/flow/supervision.mjs`](../../../../.claude/flow/supervision.mjs) and the drivers that use it ([the flow's README](../../../../.claude/flow/README.md#supervision-what-lets-agents-run-unattended)):

1. **Isolated dependencies.** Each agent and each grading gets its own copy of the dependencies, or a read-only one. Today they get hard links to a shared `node_modules`, and an agent that writes into a package changes the original.
2. **A budget reserved before an agent starts,** not checked after it finishes.
3. **A supervisor** that stops an agent past its time, and records why.

## Predictions, written before the runs

These were written after the P2 tree's starting point was graded, and before any other. P2 already passed the chaos test and both concurrency tests. It failed the drill (it has no `FAULT_DRILL`) and the service (it has none).

- **15, notices.** The architecture trees made their outbox durable in E4, so the guarantee should already hold there, and the agent mostly adds the drill. A plain tree that records the archiving and its notices in one transaction holds it too. One that does not must add a transaction or an outbox of its own. *Prediction: every arm delivers; the architecture arms spend less on this request than on the others.*
- **16, concurrency in one process.** A plain tree that loads and saves in one synchronous step is serialised by Node and loses nothing. The architecture trees check the version and retry three times, so they lose nothing either. Under twenty writes at once, though, they may refuse some. *Prediction: no arm loses a change silently; the architecture arms refuse more.* The starting point already refutes the second half: no tree refused any.
- **16, two processes.** This prediction was written after the starting point, which fails in five trees of six. The architecture arms' repositories already carry a version, so they need adapters that read the database rather than a cache, and a version check in the write. The plain arm must also add a check of its own, or keep each change in one SQL statement. *Prediction: every arm delivers. The architecture arms' changes stay in adapters. Their cost is not lower than the plain arm's, since both remove a cache.*
- **17, the service.** The architecture arms add an adapter behind a port and a reaction that publishes through the outbox. The plain arm builds a durable queue with retries. *Prediction: every arm delivers. The architecture arms' change stays in adapters and wiring. The plain arm's cost rises more on this request than on the others, and this is where the architecture could narrow the gap.*
- **Overall.** If the plain arm needs more work than the architecture arms to meet requirements 15 and 17, this is the first place the architecture pays for one agent. If it does not, the outbox and the version check are one way to meet these requirements, not a reason to choose the architecture, and [ADR 31](../../../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) says so.

## Biases, written down now

- **Author of everything.** The same author wrote the architecture, these requests and their tests. The drill names a moment, "after the archiving is stored", that an event-driven design has and a single transaction does not. A tree with one transaction meets it trivially, which is the correct verdict for that design.
- **Chaos is a sample.** The kill delays come from a fixed seed, but the point the server has reached at each delay depends on the machine, so two gradings may hit different moments. The chaos test is graded twice; a failure in either counts.
- **Two processes, one file.** Contention is tested between two processes on one SQLite file, on one machine. A server database, network partitions and more than two writers are not.
- **Few runs.** Two trees per arm, one agent each.
