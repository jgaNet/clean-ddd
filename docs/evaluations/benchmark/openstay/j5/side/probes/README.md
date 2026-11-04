# A maintainer who did not write the tree: three change probes

J4's reading named the files a developer would edit for three changes, without making them ([`j4/reading.md`](../../../j4/reading.md#the-change-probes)). J5 makes them. A fresh agent, which did not write the tree, gets one request on a copy of a final tree and carries it out. It is graded on the request's own hidden tests and on every earlier one.

| Probe | What it changes | Why it is a probe |
| --- | --- | --- |
| [P1](p1-second-provider.md) | The Swiss hosts are paid through a second provider, with its own API, signature and webhooks. | How much of the payouts was written against one provider. |
| [P2](p2-no-stay-no-cleaning.md) | The cleaning fee is refunded in full on any cancellation, and shown apart in the earnings. | A rule of request 8 changes. It is found where the refundable amount is decided, once or many times. |
| [P3](p3-minimum-payout.md) | A host's minimum payout, per currency: what is below it waits and is paid with what comes next. | A rule crosses the per-booking and weekly payouts, the failures, the pause and the dashboard. |

**P2 changed since J4.** J4's wording ("a host sets a fixed fee per stay…") was written as if no cleaning fee existed. But request 2 already has one, request 5 puts it on the quote, and request 8 refunds it under the policy like a night. What is left to change is a rule: no stay, no cleaning.

## How a probe runs

- **On every final tree:** a copy of each of the six final trees, after the ladder and the second grading.
- **Each probe alone.** Each probe starts from the final tree, not from another probe's result. That makes 18 attempts.
- **The agent:**
  - It is the strongest model, as a maintainer would be, given the request alone.
  - In the Clean DDD arm it also gets the probe's storm, decided by the maintainer before the run, as at the ladder (to be written once the final trees' contexts are known).
  - It is given no escalation and one attempt.
- **Graded on:**
  - the probe's hidden tests;
  - every hidden test from 1 to 100, so that a regression shows;
  - the cost;
  - the files read and the files changed, from the transcript;
  - the lines changed.
- **The hidden tests** are written and passed on the solvability tree before any probe runs, as for the ladder's.
