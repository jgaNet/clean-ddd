# Two developers on one request (J5 side probe), written before any run — 7 November

## The question

The architecture is meant to let several people work at once, each in the contexts they own, meeting only
at the contract (the context map, the storm, the integration events in the shared kernel). Does it, when
the two sides are two agents that cannot see each other's work until it is pushed, and talk only through a
channel? And does the Full+ kit (identity is born once; a relationship crossed is tested) change the outcome
at the seam where J5's clean-1 failed request 64?

## The request and the split

Request 64, the moderation queue, on clean-1 where J5 stopped (after 63). The queue lists reports made in
Messaging (56), Reviews (61) and Moderation itself (63), and a client finds each report by the id it was
answered when it made it. In J5, clean-1 failed exactly there, with every model: Moderation built its own
ids for the reports Messaging and Reviews announced. One agent with the Full+ kit (probe p64b) delivered it
at step 0.

The request is split by owner, as a team would split it:

- **Upstream team** owns `src/Contexts/Messaging/**`, `src/Contexts/Reviews/**`, and the integration events
  they publish (`src/SharedKernel/Application/IntegrationEvents/MessagingIntegrationEvents.ts`,
  `…/ReviewsIntegrationEvents.ts`).
- **Moderation team** owns everything else the request needs: `src/Contexts/Moderation/**`, the composition
  root (`src/Bootstrap/**`), and the shared documents (`conventions/**`, `docs/**`), since request 64 is
  Moderation's.
- Anything else (other contexts, the building blocks, the rest of the shared kernel) is owned by nobody in
  the probe, and a commit touching it is refused like one touching the other team's files.

Both teams read the whole request. Each is told what it owns, that the other team owns the rest, and how to
reach it.

## How they work

- One bare repository is the remote, its `main` at the base. Each team has its own clone and its own branch
  (`upstream`, `moderation`), and pushes that branch only. Each may `git fetch` and read the other's branch.
- A pre-commit hook in each clone refuses a commit that touches a file the team does not own (as a code
  owner's review would). It is not hidden; going around it (`--no-verify`) is counted.
- A channel: one append-only file both read and write through two commands, `channel say <text>` and
  `channel wait [seconds]` (blocks until someone else writes, at most 100 s per call, so a call fits the
  agent's shell timeout; an agent waits longer by calling it again).
- Both start at the same moment, with the smallest model of the ladder (claude-haiku-5-5), a budget of $12
  each and 90 minutes each.
- Each team is done when its own gate passes on its branch (`yarn architecture gate --base main --mode
  architecture --fix`). When an agent stops and its gate fails, the driver tells it once, as the ladder does
  (one feedback turn); the other team's work may be what it is waiting for.

## Integration

When both have stopped: the upstream branch is merged into `main`, then the moderation branch (`--no-ff`).
A conflict is recorded with its files; the moderation agent then gets one turn to merge `origin/main` into
its branch and resolve it, and the merge is tried once more. A second conflict is an integration failure.

## What is graded, on the merged head

- **Delivered**: the gate passes from the base, and the hidden tests of 64 and of the requests at the seam
  (56 reporting a message, 61 review rules, 63 reporting a listing) all pass.
- Identity at the seam: whether the queue answers the ids the client was given (the failing assertion of
  J5's clean-1), read from the hidden test's result.
- Ownership: commits refused by the hook, hook bypasses, files changed outside a team's paths.
- Coordination: messages in the channel, from whom, and whether either side waited.
- Merge: conflicts and their files.
- Cost and time: each agent's cost, the sum, and the wall time (the slower of the two plus integration),
  against the single-agent baselines on the same base and model: J5 clean-1 step 0 (old kit, failed) and
  probe p64b step 0 (Full+ kit, delivered).

## Arms and runs

- **A, old kit**: J5 clean-1 at 4837e89 with the storm of 64 committed, as the ladder gave it.
- **B, Full+ kit**: Full+ clean-1 at 76f2576 (the same tree migrated), with the same storm.
- Two runs per arm (A1, A2, B1, B2), the two arms' runs interleaved; at most two runs at once (four agents),
  beside the three Full+ ladders.

## Predictions (falsifiable)

1. In A, the identity defect survives the merge in at least one of the two runs.
2. In B, the upstream team carries the report's id in its events without being asked by the moderation team
   in at least one run (the rule says so), and the queue answers the ids the client was given in both runs.
3. In B, at least one team's gate refuses its branch alone for a relationship test it cannot pass without
   the other team's work (the gate step asks for one test across two owners): that is the friction the
   split relationship test (an upstream half and a downstream half) would remove. If no run shows it, the
   split is not needed for this case.
4. In every run, the two agents together cost more than the single agent of the same arm on this request.

Nothing here changes J5's verdicts or the Full+ arm.

## Addendum, 7 November 18:20 UTC (after A1 and B1, before A2 and B2): arm C, the integrator

A1 and B1 showed something the protocol did not plan for: a request in the channel after the other side's session
ended is lost (B1, 09:15), and a failure the merge makes in one team's file is nobody's (both runs: Messaging's e2e
test read a table Moderation no longer writes). The maintainer asked for a third arm with that role.

- **C, Full+ kit with an integrator**: as B, and after the merge the driver plays the integrator. It runs the gate on
  the merged `main`; each failing step goes to the team that owns a file it names (no file, or no owned file: to
  Moderation, whose feature it is), as one more turn of that team's conversation, which also tells it to read the
  channel. The teams merge `origin/main`, fix, push; the integrator merges again. Two rounds at most; then the head
  is graded as in A and B.
- Two runs, C1 and C2, after A2 and B2, one at a time.
- Prediction 5: C delivers in at least one of its two runs, where B delivers in neither; and C costs more than B.
