# OpenStay's pilot (J2): ten features, two arms, from the smallest model up

**Date:** 2026-11-01 · **Protocol:** [`benchmark/openstay/`](benchmark/openstay/README.md) · **The kit, written and rehearsed before the runs:** [`benchmark/openstay/pilot/`](benchmark/openstay/pilot/README.md) · **Logs, plans, grades, metrics, trees, the reading:** [`flow/openstay-pilot/`](flow/openstay-pilot/README.md)

OpenStay is a lodging marketplace with no commission. Its invariants are hard ones:
- no night booked twice;
- a price kept as it was accepted;
- a notice to a host owed once, whatever crashes.

The pilot is its first checkpoint with agents. Ten features (accounts, listings, search, the host's calendar, quotes, instant booking, requests to book, cancellation, a booking's history, notices to hosts) were given in product words, one at a time, to two arms:
- **simple:** a plain TypeScript project, held by `yarn verify`;
- **Clean DDD:** `clean-ddd create`, its tooling, and a storm per feature decided with the maintainer, held by the gate.

**Three trees per arm.** Each feature of each tree started with the smallest model, and was done again one step up only when its attempt failed, as the protocol's escalation rule says. The models were Claude Haiku 5.5, then Sonnet 5.5, then Opus 5.5, the same family throughout.

**Two witnesses,** one tree per arm, ran the ten features with the strongest model only.

## The answer, first

| Tree | Steps per feature | Escalations | Hidden tests (second grading) | Cost | Agent time | Lead time |
| --- | --- | --- | --- | --- | --- | --- |
| simple-1 | `0000000000` | 0 | 10/10 | $1.39 | 67 min | 100 min |
| simple-2 | `0000000000` | 0 | 10/10 | $1.82 | 82 min | 118 min |
| simple-3 | `0000000000` | 0 | 10/10 | $1.07 | 65 min | 101 min |
| clean-1 | `0000000001` | 1, not reproduced | 10/10 | $7.18 | 116 min | 149 min |
| clean-2 | `0000000000` | 0 | **9/10**: a notice lost under a crash | $6.42 | 98 min | 124 min |
| clean-3 | `0000010000` | 1, real | 10/10 | $8.19 | 107 min | 134 min |
| simple-w (strongest only) | — | — | 10/10 | $9.32 | 77 min | 123 min |
| clean-w (strongest only) | — | — | 10/10 | $21.63 | 77 min | 101 min |

How to read the columns:
- **A step** is `0` for the smallest model and `1` for the intermediate one; no feature needed the strongest.
- **Agent time** is the agents' own.
- **Lead time** adds the driver's verdict and the hidden tests, graded after every attempt.

What the table shows:
- **Every tree delivered every feature.** Eighty of eighty passed their hidden tests when the ladder delivered them. Graded again on a quiet machine, 79 of 80 passed: clean-2's chaos test lost a notice, a defect the independent reading had found by reading alone ([below](#robustness-the-relay-acknowledges-before-the-reactions-have-run)).
- **The simple arm needed nothing above the smallest model,** in 30 features of 30.
- **The Clean DDD arm needed it once,** in clean-3's instant booking. A second escalation, clean-1's feature 10, did not reproduce on a quiet machine and is not counted against the arm.
- **The simple arm was 3.5 to 7.7 times cheaper** ($1.07–1.82 against $6.42–8.19), 1.2 to 1.8 times quicker in agent time, and wrote a third of the source:
  - 2,145–2,388 lines against 7,075–7,759;
  - 34–45 files touched against 186–229.

  The ranges do not overlap on any of these.
- **With the strongest model only, the gap narrows but stays:** $9.32 against $21.63. The agents took the same 77 minutes in both arms, and clean-w's lead time was the shorter.
- **The smallest model widens the gap rather than closing it.** It made the simple arm 6.5 times cheaper than its witness, and the Clean DDD arm 3 times.

## The hypothesis, after ten features

The protocol's hypothesis was written before any run: *the step features need rises faster in the simple arm than in the Clean DDD arm as the trees grow.*

| Over the first ten features | Simple | Clean DDD |
| --- | --- | --- |
| Share delivered above the smallest model | 0 of 30 | 1 of 30 (2 with the one that did not reproduce) |
| Share delivered only by the strongest | 0 of 30 | 0 of 30 |

**Not supported at this size.** The smallest model delivered everything in the simple arm. The trees are small (about 2,000 source lines), and the protocol reads the curve in windows of ten features: J3 adds fifteen more, and a change not announced in advance. The question is open; the first window leans the other way.

## Robustness: the relay acknowledges before the reactions have run

The independent reading found it by reading. The second grading then caught it in one tree, and a replay reproduced it.

- **The reference's relay marks an outbox entry published as soon as the bus has it** (`relayOutbox`, [`typescript/src/Architecture/Application/Outbox.ts`](../../typescript/src/Architecture/Application/Outbox.ts)). The reactions run afterwards, asynchronously, each in a transaction of its own (ADR 30).
- **A process killed between the acknowledgement and a reaction's commit has lost that fact for that reaction.** No later relay hands it out again.
- **For OpenStay,** a booking recorded and its host never told.

| Tree | The relay | What the tests saw |
| --- | --- | --- |
| clean-1 | the reference's, unchanged | passed both gradings: the window was not hit |
| clean-2 | the reference's, unchanged | failed the chaos test in the second grading; a replay reproduced the lost notice |
| clean-3, clean-w | changed by the agent: an entry is acknowledged once its reactions have settled | passed |
| the four simple trees | none: each stores the notice in the booking's own transaction | passed |

**This is the second time a robustness test has found a gap in the reference's relay.** The first was the startup relay without a unit of work ([the robustness campaign](2026-10-31-flow-robustness.md#the-defect-what-the-startup-relay-does-not-carry), fixed). With an in-memory outbox nothing survives a crash, so no test of the reference can see either gap. A tree that makes its outbox durable inherits both.

**The fix belongs in the reference, in every language, and it is made** ([ADR 24's revision](../adr/0024-events-are-durable-before-they-are-published.md#revision-an-entry-is-acknowledged-once-its-reactions-have-committed)):
- the relay now acknowledges an entry only once every reaction it was delivered to has succeeded, as d2's agent did in the robustness campaign, and clean-3's and clean-w's here;
- it keeps a failed entry pending for the next relay;
- it does not hand out an entry already on its way.

Writing the test found a second, older defect: the in-memory bus decided each subscriber's inbox from a status every subscriber shares. Each language now has tests that fail against the code they guard:
- TypeScript, Python and Go acknowledged at once, so all three points were defects there;
- Rust awaited its reactions, but acknowledged a failed one and one still on its way.

**Clean-2's feature 10 counts as failed for robustness,** as the protocol says a chaos test failing in either grading does. It was delivered by the ladder, graded once at the time.

## Maintainability: the independent reading

A fresh agent that did not run the pilot read the eight final trees against [the rubric](benchmark/openstay/pilot/reading.md), written before any final tree was read ([its report](flow/openstay-pilot/reading.md)).

| Tree | O1 one place | O2 no night twice | O3 refusal as outcome | O4 time and money as values | O5 kept as accepted | O6 parts apart | O7 crash and second process | O8 security | O9 tested |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| simple-1 | partial | partial | partial | partial | pass | **fail** | pass | pass | pass |
| simple-2 | partial | pass | pass | partial | pass | **fail** | pass | pass | pass |
| simple-3 | partial | pass | partial | partial | pass | **fail** | pass | pass | pass |
| simple-w | partial | pass | partial | partial | pass | partial | pass | pass | pass |
| clean-1 | partial | pass | pass | pass | pass | pass | **fail** | pass | pass |
| clean-2 | partial | pass | pass | pass | pass | pass | **fail** | pass | pass |
| clean-3 | partial | pass | pass | pass | pass | pass | pass (one suspected window) | pass | pass |
| clean-w | partial | pass | pass | pass | pass | pass | pass (one suspected window) | pass | pass |

- **The architecture bought structure.**
  - Every Clean DDD tree keeps its contexts apart, one way, through ports.
  - It decides time and money as values, and answers refusals as outcomes.
  - Three of the four simple trees have a cycle between listings and bookings.
  - The simple trees throw typed refusals and read the clock inline.
- **It did not buy correctness under failure.** The two Clean DDD trees that kept the reference's relay can lose a notice. No simple tree can, by the reading or by the tests. One simple tree (simple-1) can block a night between another server's check and its booking, which no test reached.
- **No tree states every rule once.** The stay limits are decided twice (in the quote and again in search) in seven trees of eight, in both arms alike. Clean-w alone has one function.
- **The change probes did not favour the architecture.**

  | Probe | Simple | Clean DDD |
  | --- | --- | --- |
  | Seasonal prices | 4–6 files | 17–19 files |
  | A non-refundable policy | 2 files | 2–4 files |
  | A notice to the traveller | 3–5 files | 9–13 files |

  Part of that is the architecture's one-file-per-thing layout rather than coupling. The lines read to find the files were closer: about 540–1,070 against 1,190–1,350 for seasonal prices, and 730–890 everywhere for the notice.

## Four scores, kept apart

| Score | What the pilot says |
| --- | --- |
| **Functional correctness** | Both arms delivered all ten features; the simple arm with the smallest model throughout. |
| **Robustness** | The simple arm met invariant 12 in every tree. Two Clean DDD trees inherited a gap in the reference's relay; one lost a notice under test. |
| **Maintainability** | The Clean DDD trees are better structured (contexts apart, time and money as values, refusals as outcomes). The simple trees are smaller, and more local on the probes. Neither arm states every rule once. |
| **Cost of change** | The simple arm was 3.5–7.7 times cheaper with the smallest model, and 2.3 times cheaper with the strongest. |

## Escalations, each checked against the kit

- **clean-3, feature 6, smallest model: `hidden`.**
  - **The defect:** the host could block a night already booked, which request 6 forbids. The test's assertion fails the same way when replayed alone.
  - **The fix:** the intermediate model delivered the feature.
  - **Counted.**
- **clean-1, feature 10, smallest model: `regression`.**
  - **What failed:** two of feature 9's tests (a declined request; contact after confirmation), graded while four trees and their agents loaded the machine.
  - **Replayed on a quiet machine,** that commit's feature 9 tests passed three times in three, and feature 10's passed with a clean exit.
  - **Not counted against the arm.** The ladder still moved to the intermediate model, which delivered the feature; the protocol's rule had no way to tell at the time. Since then, the grader keeps what a failed test said, so that such a case can be read on the spot.
- **No defect of the kit was found.** No amendment was made.

## What follows

- **Done: the reference's relay is fixed in every language** ([above](#robustness-the-relay-acknowledges-before-the-reactions-have-run)). The Clean DDD arm's next trees start from it, as these started from the startup relay's fix.
- **Add that kill to the kit's chaos test for J3.** A kill timed after the booking's commit and before the notice is stored is the window the random delays reached only once in four gradings.
- **J3** is fifteen more features and the first change not announced in advance. The protocol's decision at this checkpoint (continue, adjust or stop) is the maintainer's.
  - **The cost ranges have separated.** The question the series was built for, whether the simple arm needs stronger models as it grows, is still open.
  - **Neither stop condition holds.** The ranges have not separated on that question, and nothing yet says they cannot.

## Biases

- **Author of everything,** as in every campaign: the architecture, the requests, the tests, the storms' proposals, and this record.
- **Small trees.** Ten features and about 2,000 lines in the simple arm. The hypothesis is about growth; this is its first point.
- **Machine load.** Four trees ran at once on four processors, their hidden tests graded inline. One escalation came from it. The second grading ran one tree at a time.
- **The chaos test is a sample.** It reached the relay's window once in four gradings of the two trees that have it.
- **One reader,** an agent, who could not be blind to the arm.
- **The storms are not priced in time.** The maintainer accepted the session's proposals in one answer.

## Cost

| | Reported |
| --- | --- |
| The series, six trees | $26.07 |
| The witnesses, two trees | $30.95 |
| **The pilot** | **$57.02** of the $200 ceiling |
| The reading, the kit's review and solvability tree, the diagnoses | not reported by the runner |
