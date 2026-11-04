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

## The earlier cases P2 supersedes

P2 changes a rule five earlier cases assert: a strict cancellation refunds half the cleaning fee, and none of it on the day of check-in. On a P2 attempt these five cases are expected to fail and are not counted as regressions; P2's own test asserts the new rule in their place. Every other case of 1 to 100 is.

| File | Case |
| --- | --- |
| 8-cancel-a-booking | makes refundable what the policy gives by days before check-in, and the tourist tax in full |
| 31-refunds | asks the provider for the refundable amount, under the booking id, and reads pending, then refunded |
| 31-refunds | sends nothing for a booking never paid, nor for a refundable amount of zero |
| 32-host-refunds | refunds what the host or a manager gives, through the provider, listed oldest first with the cancellation |
| 94-hosts-report | reports each host, country and currency, what counts and what does not, and who is reportable |

The five fail on the solvability tree's P2 and on no other probe.

## How the probes were checked

An agent wrote the three probes on the solvability tree from the requests, each on its own branch from the tree's J5 end (`c33599f`): P1 `911e3d5`, +583/−42 in 8 files; P2 `e754d5f`, +59/−21 in 6 files; P3 `0f5f5e7`, +221/−8 in 3 files. Each probe's own test passes (9, 5 and 7 cases), and each branch's `yarn verify`. Graded on 1 to 100:
- P1 passes all 101 files;
- P2 fails the five cases above, and nothing else;
- P3 fails one case of 97, the defect of the test found and fixed then ([the kit's README](../../README.md#how-it-was-checked-before-use)).

It found no case of a probe's test that asserts what its request does not say.
