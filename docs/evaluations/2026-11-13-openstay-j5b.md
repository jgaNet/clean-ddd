# OpenStay's J5b: both trees at a hundred, and what they cost to get there

J5b replayed requests 51 to 100 on one tree per arm, with everything J5 taught: the repairs as guide sections, the
Full+ kit, and the bench's fixes. The Clean DDD tree was written by one agent per context on its 14 split requests
([the protocol](benchmark/openstay/j5b/README.md)). It ran from 10 November, 14:24 UTC, to 13 November, 15:02.

**What it can show:** whether J5's corrections and the bench's fixes carry a tree of each arm to a hundred.
**What it cannot:**
- **In sample.** Every correction was written after seeing failures on these same requests.
- **One tree per arm.**
- **Two causes in one arm.** It does not separate the architecture from the split, since only the Clean DDD tree was
  split.

## The answer, first

- **Both trees reached a hundred.** simple-3 finished on 12 November at 16:39, after one triaged failure, repaired and
  then reworded once. clean-3 finished on 13 November at 15:02, after two triaged failures, each repaired once.
- **The simple tree was 3.7 times cheaper and delivered more at the first step.**

  | | simple-3 | clean-3 |
  | --- | --- | --- |
  | Agents' cost, its three runs | $42.37 | $156.03 |
  | Delivered at step 0 | 47 of 50 | 39 of 50 |
  | Mean time from a request to its delivery | 60 minutes | 87 minutes |

- **Every triaged failure was a rule a request set and nothing executable held:**
  - an operation's `error` shape (clean-3, 61);
  - `null` in a later state (simple-3, 73);
  - the machine's time instead of the tree's clock (clean-3, 73).

  None was a boundary crossed. Each repair held: R3 on its rewording, R5 on its rewording, R6 on its first wording.
- **The split was safe and paid for nothing measurable.**
  - Delivered at step 0: 10 of the 14 split requests.
  - Merged results the integrator passed: 24 of 25 attempts.
  - Each control by one opus agent failed where the split had failed, on the same rule.
  - The ladder's estimate recommended one agent on all 80 requests it was asked about.
  - The owners' agents cost $78.64, half of clean-3's total, for 14 requests.
- **The bench needed one amendment and four interventions, none of which changed a verdict.**
  - The amendment: from request 86, clean-3 was graded in parallel, at the maintainer's request, after a validation
    that gave the same verdicts on every file.
  - The interventions: three container restarts, a ladder stuck two hours on a stale machine slot, and the disk down
    to 1.4 GB.

## Where each tree went

| | simple-3 | clean-3 |
| --- | --- | --- |
| Delivered, 51 to 100 | 50 | 50 |
| At step 0 / 1 / 2 (haiku / sonnet / opus) | 47 / 1 / 2 | 39 / 7 / 4 |
| Triaged failures (repairs) | 1: 73 (R5, then R5 reworded) | 2: 61 (R3 reworded), 73 (R6) |
| Runs | 3 (`j5b-simple-3`, `-r1`, `-r2`) | 3 (`j5b-clean-3`, `-r1`, `-r2`) |
| Head, pushed to `jgaNet/openstay` | `277d781` on `j5b/simple-3` | `c1ac8da` on `j5b/clean-3` |
| Source / test lines at 100 | 18,458 / 45,379 | 56,834 / 42,378 |
| Commits / contexts / ADR files | 115 / — / — | 388 / 14 / 99 |

**The escalations:**

- **simple-3:**
  - 66 `suspending-accounts`, to step 1;
  - 73 `transfer-proof`, triaged twice;
  - 96 `calendar-import`, to step 2.
- **clean-3:**
  - to step 1:
    - 51 `conversations` and 69 `payment-instructions`, on their own tests;
    - 53 `contact-details-held-back`, on a regression;
    - 56 `reporting-a-message`, on the verdict;
    - 90 `card-fees-passed-on`, on the verdict, for formatting alone;
    - 99 `operations-dashboard` and 100 `pausing-payouts`, on their own tests;
  - to step 2:
    - 68 `suspicious-accounts`;
    - 87 `currencies`;
    - 96 `calendar-import`;
  - triaged: 61 `review-rules` and 73 `transfer-proof`.
- **Shared:** 96 `calendar-import` took both trees to opus, on the same hidden line ("leaves the host's own blocks
  apart, and takes nothing from a booking or a hold").

## The failures and their repairs

As [J5b's repairs](benchmark/openstay/j5b/repairs.md) record them, under J5's rule (one repair per triaged failure, one
rewording, a second failure after it stops the tree):

| Tree, request | What failed | Repair | Replay |
| --- | --- | --- | --- |
| clean-3, 61 | An operation's `error` read `{ type, message }` where the request says `"<NAME>"` | R3 reworded (the API's shapes) | Delivered at step 0, split |
| simple-3, 73 | `payment` read `null` for a booking lapsed unpaid | R5 (what null means) | Failed again |
| simple-3, 73 | The same | R5 reworded | Delivered at step 2 |
| clean-3, 73 | The lapse sweep took the machine's time; Payments took the tree's clock | R6 (OpenStay's now) | Delivered at step 2, split |

- **Who decided.** The maintainer decided the verdicts of 61 and of simple-3's 73. On 11 November, for the night, the
  maintainer delegated the verdict and the repair of clean-3 to the operator; clean-3's 73 was handled that way.
- **What the reference took from them.**
  - R6 became a rule of the reference ([ADR 42](../adr/0042-an-application-has-one-clock.md), DOMAIN-ONE-CLOCK, held
    by the linter in all four languages).
  - R3's general half went into the guide `create` writes.

## The split by context

- **The requests:** 14 of clean-3's 50 were written by one agent per context: 55, 56, 61, 65, 66, 67, 68, 72, 73, 76,
  79, 80, 93, 97.

| | Split (14 requests) | One agent (36 requests) |
| --- | --- | --- |
| Delivered at the first step, first run | 10 | 28 |
| Mean agents' cost a request | $6.19 | $1.93 |
| Without 61, 68 and 73 (its three costliest) | $2.45 | — |
| Mean time from a request to its delivery | 148 minutes | 63 minutes |
| Without 61, 68 and 73 | 72 minutes | — |

- **The integrator:** 25 integrated attempts, 24 passed by its gate on the merged result, in 46 rounds (1.8 an
  attempt).
- **The owners' verdicts** (each owner's gate on its own branch): 56, of which 28 failed. In J5b these ran before
  correction 13, so a failure that waited on the other owner's part was sent back to an owner who could not fix it.
- **The controls** (one opus agent after the split failed at every step): 2, on 61 and 73. Both failed on the same rule
  as the split. Those failures were the tree's, not the split's.
- **The estimate** (`clean-ddd strategy`, asked with priority `cost` on every attempt with a storm): 80 answers, all
  "one agent". The split requests had 4 to 7 stickies, under the estimate's break-even of 7.4 to 9.8.
- **Cost by model and role** (clean-3, all runs):

  | | haiku | sonnet | opus |
  | --- | --- | --- | --- |
  | One agent | 45 attempts, $38.49 | 8, $16.87 | 4, $22.03 |
  | An owner | 79 turns, $33.07 | 20, $10.85 | 16, $34.72 |

  simple-3: haiku 55 attempts, $26.92; sonnet 6, $4.90; opus 4, $10.55.

**What it says:** below the break-even, the split delivered as often as one agent did, cost about twice as much, and
took longer. The integrator made it safe. Nothing here measures the split above its break-even (next campaign,
correction 14).

## Cost and time

| | simple-3 | clean-3 |
| --- | --- | --- |
| Agents' cost, first run / -r1 / -r2 | $14.57 / $4.24 / $23.56 | $29.88 / $43.25 / $82.91 |
| Budget of the last run | $60 | $86, of which $82.91 spent |
| First attempt, the smallest model, one agent, at the time of the review (12 November): turns / output tokens / cost | 44 / 65k / $0.49 | 35 / 90k / $0.66 |
| Calendar span, first request to the hundredth | 50 hours | 73 hours |

- **The first attempt costs Full 35–50% more; the rest of the gap is what follows a failure:** escalations, the split,
  and the triaged requests (clean-3's 61: $17.64; its 73: $31.97).
- **clean-3's last run ended $3 under its budget.** One more triaged failure would have run it out.
- **The calendar span includes:**
  - the waits for the verdicts at the triaged failures;
  - three restarts;
  - two hours on a stale slot.

## The bench

### The amendment: parallel grading, from request 86

J5b's gradings grew with the backlog, one jest per acceptance file, to 25–40 minutes a request: as long as the writing.
On the maintainer's request (12 November), the grader gained `--workers`:
- every file runs in one jest, n at a time;
- a file that fails there is run again alone, and that run is its verdict.

**It was validated before it was used,** with two workers at low priority:

| Tree graded | Files | Verdicts | Sequential | Parallel |
| --- | --- | --- | --- | --- |
| simple-3 at 100 | 101 | the same on every file | 24.8 min | 8.7 min |
| clean-3 at 84 | 85 | the same on every file, storms included | 26.1 min | 10.9 min |

**How it was applied.** clean-3's ladder was stopped at the start of request 86's first attempt and resumed with
`gradeWorkers: 2`. Only the grader was applied to the checkout it ran from, not the rest of the reference's `main`
(corrections 12 and 13 stayed out). The plan says so (`clean-3-r2.yaml`). From 86 on:
- gradings took 10–11 minutes, and no file had to be run again alone;
- a request delivered at step 0 by one agent took 42 minutes on average, against 51 for requests 51–85.

So clean-3's times are reported in two parts, and the tree's mean of 87 minutes mixes them.

### The interventions

Every event of the run, as it was logged while it ran: [`incidents.md`](benchmark/openstay/j5b/incidents.md).

| When (UTC) | What | Effect |
| --- | --- | --- |
| 12 Nov, clean-3's 73, step 2 | The end-to-end gate on an owner's branch hung (jest idle for over 46 minutes) | The gate's 60-minute limit ended it; the integrator routed the failure; the attempt went on |
| 12 Nov, 22:04 | 1.4 GB of disk free | The operator's Rust build and the Go cache were removed (12 GB free). The jest cache, 11 GB, was left: its pruning was not permitted |
| 13 Nov, 00:08, 05:08, 10:29 | Three container restarts | Each killed an attempt or a grading in progress (88, 95, 99); each request was replayed from step 0 on its start commit; about $0.5–1 of agent work lost each time |
| 13 Nov, 10:29–12:29 | After the third restart, the resumed ladder waited two hours for a machine slot | The stale slot named the pid the new process had been given again (211), so `machine.mjs` saw a live owner: itself. The slots were removed by hand. Fixed in the reference: a slot naming this pid and not taken by this process is taken over |
| 13 Nov, 01:45 | 90's first attempt escalated on the verdict for formatting alone (`format:check`, seven files) | One step lost to bookkeeping the gate's `--fix` does not do (the architecture review, F6) |

None changed a verdict: a replay starts from the same commit, under the same plan.

## What J5b says, against J5

- **Both arms reach a hundred once J5's rules are given from the first request.** In J5, no tree of either arm reached
  a hundred: the simple trees stopped at 66, 73 and 73, and the Clean DDD trees at 51, 64 and 64. With one repair per
  failure, the furthest of each arm reached 85.
- **The rules that held were given as sentences, at the start.** Late, a sentence reaches only the code written after it
  (J5's CQS probe). J5b's three failures came at the seams J5's rules did not name: an operation's error, a null in a
  later state, the time.
- **Full's cost over Simple is of the same order as in every campaign before** (J2–J4: 1.5 to 6 times). Full kept its
  structure: 14 contexts with no import refused. Nothing in J5b measured what that structure buys, because no change
  was unannounced. That is the measure RFC 0005 makes J6's first (P4).

## Biases

- **In sample.** The repairs, the kit and the bench were all shaped by failures on these requests.
- **One tree per arm.** In J5, trees of one arm stopped 13 requests apart.
- **The operator.** The operator ran the bench, triaged the failures and, for one night, decided clean-3's verdict and
  repair. The maintainer delegated that decision and can revisit it. The repair rule was written before.
- **An amendment during the run.** The grading changed at request 86, for clean-3 only. The verdicts are the same by
  validation; the times are not comparable across it.
- **The split and the architecture are confounded** in clean-3.
- **One model provider.** Model versions were fixed by the plans.

## What follows

- **The reference's response:**
  - the operation's read shape in the contract ([ADR 41](../adr/0041-an-operation-read-is-in-the-contract.md));
  - one clock ([ADR 42](../adr/0042-an-application-has-one-clock.md));
  - the API's shape in the created guide;
  - the ladder's corrections 12 and 13;
  - the parallel grader.
- **J6:** the [three-arms protocol](benchmark/three-arms/README.md), with
  [RFC 0005](../rfc/0005-what-the-literature-and-j5b-say-before-j6.md)'s decisions D1–D5 taken before its
  registration.
- **The [architecture review](2026-11-12-architecture-review.md)'s P0:** integration events as versioned schemas,
  relationship tests in every language, and the API's specification as data. They answer the category J5b's failures
  belong to.
