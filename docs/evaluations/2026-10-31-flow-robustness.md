# The robustness campaign: crashes, concurrent writers and an unreliable service, in every arm

**Date:** 2026-10-31 · **Protocol and predictions, written before the runs:** [`benchmark/robustness/`](benchmark/robustness/README.md) · **Before it:** [the extensions](2026-10-30-flow-extensions.md) · **Logs, plans, grades, metrics, the reading:** [`flow/robustness/`](flow/robustness/README.md)

[ADR 31](../adr/0031-the-architecture-is-a-guardrail-and-a-coordinator-not-an-accelerator.md) put this campaign first. The architecture's outbox, inbox, reactions in their own transaction and version check exist for crashes and concurrent writers, and no hidden test had exercised them. If the architecture buys correctness rather than only locality, it should show here.

**Three requests, in product words, the same for every arm:**
- **15:** notices survive a crash.
- **16:** changes that arrive at the same moment, in one process and in two processes on one file, are never lost silently.
- **17:** an outside notification service that refuses and times out gets every notification until it accepts it, and never again after that.

**The six trees.** They are the SQLite trees of the extensions' E4:
- **A**, the architecture with the `clean-ddd` tooling: runs 2 and 3;
- **D**, the architecture as prose: runs 1 and 2;
- **P**, a plain project: runs 2 and 3.

One fresh agent per tree took the three requests in order, in one conversation, under its arm's driver. The hidden tests kill the server's process group the way a power cut would, run two servers on one database file, and play the outside service.

## The answer, first

**The architecture did not buy correctness under failure.**
- Both plain trees met all three requirements, at their usual price.
- Two of the four architecture trees did not: after kills at random moments, they told some archivings two or three times.
- Both failures have one cause, a line every language's reference ships. The server's startup relay runs without a unit of work, so the inbox that makes delivery idempotent never sees what it relays.
- The two architecture trees that passed had given that relay a unit of work.

| Tree | 15, drill | 15, chaos (graded twice) | 16, one process | 16, two processes | 17, the service | Features 1–7 and 14 afterwards | Time | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A run 2 | ✓ | ✓ ✓ | ✓ 0 refused | ✓ 0 refused | ✓ | no regression | 27.1 min | $5.07 |
| A run 3 | ✓ | **✗ ✗ three archivings told twice** | ✓ 0 refused | ✓ 0 refused | ✓ | no regression | 23.7 min | $4.44 |
| D run 1 | ✓ | **✗ ✗ three archivings told two or three times** | REFUSALS_D1 | | ✓ | no regression | 39.8 min | $6.18 |
| D run 2 | ✓ | ✓ ✓ | REFUSALS_D2 | | ✓ | no regression | 28.0 min | $5.64 |
| P run 2 | ✓ (amended) | ✓ ✓ | REFUSALS_P2 | | ✓ | no regression | **19.0 min** | **$2.45** |
| P run 3 | ✓ (amended) | ✓ ✓ | REFUSALS_P3 | | ✓ | no regression | **21.8 min** | **$2.95** |

The time is from the run's start to its last gate. The cost is the one the agent runner reports.

**What the table shows:**
- **Delivery under failure:** P 2 trees of 2, A 1 of 2, D 1 of 2. No arm lost a change, and none lost a notice; the two failures double.
- **Price:** P was the soonest and the cheapest again. A and D took 1.1–2.1 times its time and 1.5–2.5 times its cost, and P's range overlaps neither.
- **Nothing regressed.** Every tree still passes the hidden tests of features 1–7 and of the move to SQLite (14).
- **The security audit found nothing in any tree, before or after** ([below](#the-security-audit)).

## The defect: what the startup relay does not carry

Two diagnoses, one per failing tree, made by separate agents on copies of the trees, found the same mechanism, and each confirmed it by experiment:

1. **When the server starts,** it relays what the previous run made durable and did not publish. It builds that relay's `ExecutionContext` with no unit of work. In a3 this is `src/Bootstrap/Fastify/createApplication.ts:57-61`; in d1, `:86`.
2. **The agent had put the durable inbox in the unit of work.** A reaction's base handler reads `context.unitOfWork?.inbox`; with no unit of work it reads nothing. The `?.` fails open: it checks nothing, records nothing, and runs the reaction with no transaction.
3. **To survive a crash, the same agent kept each outbox entry until every reaction had finished.** So a kill after the reactions committed and before the acknowledgement leaves the entry pending. At the next start the relay hands it out again, past an inbox it does not consult. That is the second notice.
4. **The third comes from a reaction that runs again without an outbox.** The domain event's reaction re-runs at startup. With no unit of work, it publishes its integration event straight to the bus, under a fresh id, so even a working inbox would take it for a new message.

**Evidence.** Each diagnosis logged every delivery. In each crashed round, the request's process handled a message with its inbox and saved one notice. The next process handled the same message under the trace `startup` with no inbox and saved again. Giving the startup context a unit of work, one line, made both tests of request 15 pass twice in a row in both trees.

**Whose line it is.** The context without a unit of work was not written by the agents. It is the reference's:
- [`typescript/src/Bootstrap/Fastify/createApplication.ts`](../../typescript/src/Bootstrap/Fastify/createApplication.ts) builds it, and so do the Starter's composition root and the Rust, Python and Go composition roots;
- the comment above it says it is "where a store's outbox would be relayed".

With the reference's in-memory outbox there is nothing to relay, so no test of the reference can see the gap. A tree that makes its outbox durable, as every architecture tree did in E4, inherits it. Before this campaign it cost little: an entry was marked published as soon as the bus had it, so a crash lost a notice rather than repeating one. That is the loss the starting point showed in two architecture trees.

**What separated the trees.** Both passing architecture trees gave the startup relay a unit of work, and d2's agent wrote why in a comment: "so that each reaction runs in a transaction of its own and records what it handled in the inbox, as it would after a request." The two failing ones made the inbox the only guard and did not wire it into the one place where delivery after a crash happens. The plain trees had no relay: each stored what an archiving owed inside the archiving's own transaction and delivered it, idempotently, from that table.

**The fix belongs in the reference, not in a tree, and it is made.** In every language the transport now builds every context that runs work, a request's and the relay's at start, with a unit of work of its own. A test in each language relays an entry a crashed run left and expects the reaction's fact once, under an id the outbox handed out; each fails with the old context ([ADR 24's revision](../adr/0024-events-are-durable-before-they-are-published.md#revision-the-relay-at-start-runs-in-a-requests-kind-of-context)).

## The predictions, against the runs

| Prediction, written before the runs | What happened |
| --- | --- |
| **15:** every arm delivers, and the architecture arms spend less on this request than on the others. | **Refuted, both halves.** Two of four architecture trees fail. Their cost on 15, $1.66–2.09, is above their cost on 16, $0.93–1.63. P delivered both at $1.01–1.15. |
| **16, one process:** no arm loses a change silently, and the architecture arms refuse more. | **The first half held; the second did not.** No tree lost a change, and no tree refused any of the twenty simultaneous shares. |
| **16, two processes:** every arm delivers; the architecture's changes stay in adapters; its cost is not lower than the plain arm's. | **Held.** Every tree passes. The reading places 16 in the unit of work and the SQLite adapter in all four architecture trees. A and D spent $0.93–1.63, P $0.84–1.10. |
| **17:** every arm delivers; the architecture's change stays in adapters and wiring; the plain arm's cost rises most here, and this is where the architecture could narrow the gap. | **Delivery held; the rest was refuted.** Three architecture trees added a new aggregate (`Forwarding`, `OutsideDelivery`, `Delivery`), and a2 put a delivery state on `Notification`. 17 was P's cheapest request, at $0.60–0.71 against $1.70–2.47. |
| **Overall:** if P needs more work than A and D to meet 15 and 17, the architecture pays here for one agent; if not, the outbox and the version check are one way to meet these requirements, not a reason to choose the architecture. | **The second branch.** P met all three requirements for less. |

## Four scores, kept apart

**Functional correctness.**
- Every tree passes the hidden tests of features 1–7 and 14 after the campaign.
- The agents' own checks passed at the end of every request: the gate for A, `yarn verify` for D and P.
- Every run COMPLETED, with no retry.

**Robustness.** The table above. Two diagnoses, both reproduced and corrected by one line, explain both failures.

**Maintainability.** An independent reader, who did not run the benchmark and was not told the results, read the six changes against a rubric adapted from the control's ([the reading](flow/robustness/reading.md)). It found:

- **Where the guarantees live.**
  - **15 and 16:** all four architecture trees hold them in the building blocks (the reaction's base handler, the outbox relay, the unit of work, the SQLite adapter), and touch no rule of notes or sharing.
  - **17:** the architecture trees model delivery in the Notifications domain, as a new aggregate or a state on `Notification`. That is business code, not an adapter.
  - **The plain trees** put 15 and 17 in small modules of their own. p2 wraps every write method in a transaction by hand (about 20 sites, 10 of them in the notes' module). p3 wraps every command once, in its tracker.
- **One place per guarantee.** It holds in five trees. In p2, 16 is one mechanism applied by hand per method: a write method that forgets the wrapper loses the guarantee.
- **Hazards the hidden tests do not reach:**
  - **d1 can lose a notice:** its relay acknowledges an entry once every reaction has settled, even if one failed.
  - **a3 can hold one back:** an entry whose reaction failed stays hidden until the next start.
  - **Every tree has a window to send an accepted notification again** when two processes run with `NOTIFY_URL`. It is real in a2 and d1, which guard per process only. In a3, d2, p2 and p3 it is suspected, between a lease of 2.5–3 s and a lock wait of up to 5–10 s. No tree tests the service with two processes, and neither does the kit.
  - **p3 retries an unanswered notification about 6 s apart,** where the request asks at most 5. The hidden test refuses at once and never times out, so it cannot see this.
- **A trap for the next change.** a2, a3 and d2 key their durable inbox by the handler's class. A second instance of a handler on the same event would be skipped as already handled. In the probe "send by SMS too, with the same guarantee", that silently drops the second channel unless new classes are written.
- **The probe's size:** a2 10 files, a3 6, d1 4, d2 3, p2 4, p3 4.
- **No rule was written twice, and no refusal became a throw,** in any tree.

**Cost of change.**

| Tree | 15 | 16 | 17 | Source lines added · removed (`src/`, no tests) | Test lines added | Files touched |
| --- | --- | --- | --- | --- | --- | --- |
| A run 2 | $2.05 · 7.2 min | $1.32 · 9.6 min | $1.70 · 7.4 min | 638 · 62 | 852 | 38 |
| A run 3 | $1.66 · 7.2 min | $0.93 · 5.9 min | $1.85 · 7.6 min | 948 · 33 | 830 | 37 |
| D run 1 | $2.09 · 7.8 min | $1.63 · 10.5 min | $2.47 · 18.7 min | 1,084 · 73 | 811 | 44 |
| D run 2 | $2.03 · 7.8 min | $1.61 · 9.0 min | $2.01 · 8.7 min | 1,085 · 106 | 1,039 | 37 |
| P run 2 | $1.01 · 6.6 min | $0.84 · 5.2 min | $0.60 · 4.0 min | 681 · 125 | 545 | 15 |
| P run 3 | $1.15 · 8.7 min | $1.10 · 5.7 min | $0.71 · 4.3 min | 564 · 81 | 729 | 15 |

Each request's cell gives its cost and the agent's active time on it.

- **The plain trees wrote about as much source as the architecture trees,** unlike in every earlier experiment: 564–681 lines, against 638–1,085.
- **They touched far fewer files:** 15 against 37–44.
- **They were still the cheapest,** by fewer turns and less reading.

## The security audit

The [audit kit](benchmark/security/README.md) probes what an attacker would try over the API of features 1–7:
- forged tokens;
- injection;
- access to another account's note;
- fields added to a body;
- the password at rest;
- what a malformed request shows.

No agent was asked for any of it. It ran on the six trees before the campaign and after it.

**Every probe passed on every tree, before and after: 72 of 72.**
- The audit cannot tell the arms apart on this application.
- The campaign made no tree less safe.
- This is not proof that the trees are safe. The kit was shown to catch five defects planted in a copy of a plain tree, and these trees have none of those five. Every tree already hashed its passwords, checked a note's owner and kept its internals out of its answers before the campaign. This audit does not say whether that came from its scaffold or from the agents of features 1–7.

## Amendment

**One defect of the kit was found while grading, and is recorded in [the protocol](benchmark/robustness/README.md#amendments).**

- **The defect.** The drill's test expected the archive request to answer 202 before the server died. The request says the server dies right after the archiving is stored "and before it does anything else about it". A tree that stores the archiving inside the request has only the answer left to give, and dies before giving it.
- **Who it hit.** Both plain trees failed the drill on that assertion alone, and pass the rest of the test.
- **The fix.** The test now accepts a 202 or a connection cut off. It still fails a server that does not die and an archiving that was not stored.
- **How the trees were graded.** All six were graded again with the amended kit, twice. The first grading, with the original kit, is archived beside it.

## What it says

**For ADR 31, the condition it named is met:**

> If the plain trees build the same guarantees at their usual price, the outbox and the version check are one way to meet a requirement, not the only one, and this record says so.

- **The plain trees built them at their usual price.**
  - P met crash recovery, concurrency across processes and retried delivery with a table written in the same transaction, `BEGIN IMMEDIATE`, and a claimed queue.
  - It paid half the architecture arms' cost, and none of its tests failed.
- **The architecture's mechanisms did not protect the trees that had them.**
  - An outbox, an inbox and reactions in their own transaction are only as good as their wiring. The one place where wiring matters after a crash was left open by the reference itself.
  - Half the architecture trees fell into it, under the gate for A and under prose for D. Neither the gate nor the guide says that the startup relay needs a unit of work, and no check could have seen it.
- **Locality held again for crashes and concurrency.**
  - The architecture trees kept 15 and 16 out of every business rule.
  - The plain trees, p2 most, put 16 into the business modules.
  - That is the same benefit E4 measured, not a new one.

**What the campaign does not show:**
- a production database;
- more than two processes;
- a network between them;
- an outside service shared by two processes;
- a reaction that fails;
- more than one tree per arm and per run.

The reading names the hazards those would expose, and they exist in both arms.

**What followed:**
1. **Done: the startup relay has a unit of work in every language's reference,** and so in what `create` writes, with a test in each language ([above](#the-defect-what-the-startup-relay-does-not-carry)).
2. **Proposed for a later campaign: a test of the outside service with two processes.** It must fix a reading of "at most five seconds apart" first.

## Biases

- **Author of everything.** One author wrote the architecture, the requests, the hidden tests and their amendment, and the reference whose line failed.
- **Few runs.** Two trees per arm, one agent each. "Half the architecture trees" is two trees.
- **The chaos test is a sample.** Its delays come from a fixed seed, but the moment the server reaches at each delay depends on the machine. The two failing trees failed in all four gradings; the four others passed in all four.
- **Machine load.** The second grading ran while the two diagnoses ran their own copies of the test on the same machine. It agreed with the first, quiet one.
- **The reading is one reader,** an agent, adapted from the control's rubric to what this campaign changed. It ran nothing; what it calls suspected is suspected.

## Cost

| | Reported |
| --- | --- |
| Six runs, three requests each | $26.73 |
| The diagnoses and the reading | not reported by the runner |
