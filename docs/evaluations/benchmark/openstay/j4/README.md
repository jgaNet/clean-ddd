# OpenStay's J4 kit: twenty-five more features, written and rehearsed before any run

J4 runs requests 26 to 50 of [OpenStay](../README.md) on the six trees of [J3](../j3/README.md), from their J3 heads, each feature from the smallest model up. The trees are graded on every request up to the feature after each attempt, so a later feature that breaks an earlier one is a regression. This kit was written, reviewed and rehearsed before any agent ran it.

The phase is the framing's phase 2 ([j0](../j0.md#the-later-phases)):
- money, through a payment provider the tests play;
- the storage moved to PostgreSQL;
- pricing grown until it becomes a context of its own in the Clean DDD arm.

## The maintainer's decisions (2026-11-02)

- **The twenty-five features of [the proposal](proposal.md),** in the order of [`backlog/backlog.yaml`](backlog/backlog.yaml). Request 40, storage on PostgreSQL, is the change not announced in advance: nothing in requests 26 to 39 says the store will change.
- **$300 for J4, firm.** Each plan carries its ceiling: $70 per Clean DDD tree and $30 per simple tree.
- **The hole J3's reading found becomes a defect report** ([`25.1`](backlog/25.1-hosts-own-routes.md)). In clean-1 and clean-3, a manager could use the host's own bulk routes. Test 24 gains a case for it, applied to every tree. The two trees that fail it get the report at the start of J4, through the ladder like a feature, so that no tree code is written by hand.
- **A failure is replayed alone before it escalates.** Five of J3's six escalations were the machine's load. The ladder now grades a failing feature again, alone, and escalates only what fails again; both gradings are kept. Four trees run at once, as before.
- **The storms of 25.1 and 26 to 50,** every proposal accepted ([`storms/README.md`](storms/README.md)): Payments a context of its own, Pricing split out at feature 41.

## What is in it

| Path | What it is |
| --- | --- |
| [`backlog/`](backlog) | Requests 1 to 25 as J3 left them, the defect report 25.1, and 26 to 50. Request 26 holds the provider's API and its webhooks. |
| [`acceptance/`](acceptance) | The hidden tests, one file per request, with their support: [`openstay.ts`](acceptance/openstay.ts) gives each file a SQLite file and a PostgreSQL database, and [`provider.ts`](acceptance/provider.ts) is the payment provider the tests play. |
| [`storms/`](storms) | The Clean DDD arm's storms: J3's twenty-five, done, and twenty-six more. |
| [`reading.md`](reading.md) | What a reader checks in each final tree, written while J4 ran, before any final tree was read. |
| [`review.md`](review.md) | The review of the tests by a fresh agent that had only the requests. |
| [`proposal.md`](proposal.md) | What was proposed to the maintainer, and accepted. |

## The provider the tests play

A hidden test cannot depend on a real provider's test mode ([j0](../j0.md)). The kit's provider:
- answers the API request 26 gives: accounts, payments, refunds, payouts, transactions;
- keeps its own books, with a fee of 1.4 % plus 25 cents;
- says what happened only by webhooks, signed with HMAC-SHA256.

What a traveller does at the provider (pay, authenticate, fail), and what the provider decides (enable an account, settle a refund or a payout, open a dispute), are the test's to say. The test can also delay the webhooks, send them twice, reorder them, hold them back while a server is down, or forge them.

## PostgreSQL

- **A PostgreSQL 16 server runs on the machine** at `127.0.0.1:55432`, for the tests and the agents. Request 40 names it.
- **Every test file gets a database of its own on it,** besides its SQLite file. A tree uses the one it knows: `DATABASE_PATH` before request 40, `DATABASE_URL` after.
- **Test 40 checks** that the state is really in PostgreSQL, and survives a server started on another SQLite file.

## What changed in the trees before the runs

| Tree | J3 head | The J4 session |
| --- | --- | --- |
| clean-1 | ab46c8e | 0551a20 |
| clean-2 | fa7da3e | 26457bc |
| clean-3 | e7b2142 | f3c2c17 |

The session's commit declares two contexts, empty (Payments; Pricing, for feature 41's move). It also declares the new relationships, `planned`, with their reasons, and the ADR. The simple trees got nothing.

## How it was checked before use

- **The tests were written by a fresh agent from the requests,** and its choices where a request was open were closed in the requests before the review.
- **The tests were reviewed by another fresh agent** that had only the requests ([`review.md`](review.md)): 6 blocking findings, 8 weak, 8 on wording.
  - **Every blocking finding was closed:**
    - a refused value the request allowed (41);
    - a provider every server was assumed to need: request 26 now says a server starts without one;
    - a crash case that resent a webhook before the restarted server knew its payout (33);
    - an account the provider's own record did not enable (26);
    - two receipts in one second (46);
    - dates read before a server may have waited past midnight (47, 48). The grader now waits before a file that would start in the last ten minutes of a UTC day.
  - **Three weak findings became stronger tests:**
    - the tourist tax in a payout (33);
    - a refund receipt's positive amount (46);
    - the amendment to 24 in a case of its own.
  - **Every wording finding changed the request.**
- **The tests are solvable.** An agent wrote the twenty-five features on the J3 solvability tree (`9d38f9c` to `3b83518`), from the requests, the move to PostgreSQL included, told never to bend the code away from a request. Its tree passed all 51 files, 140 tests, twice, and `yarn verify`. It found no test that asserts what the requests do not say.
- **`dry-run` is clean** on the solvability tree before and after, and on clean-1 at its J4 start:
  - no hygiene finding;
  - no test of 26 to 50 passing before its feature;
  - none failing on the solved tree.
- **Every tree was graded on 1 to 25.1 at its J4 start.** The three simple trees and clean-2 pass all 26. clean-1 and clean-3 fail 24's amendment and 25.1, and nothing else: the defect report opens their J4.

## Amendments

A defect of the kit found after the runs started is recorded here, applied to every tree alike, and the attempts it touched are graded again.

1. **Test 26, two account updates in one second** (2026-11-02, 10:50 UTC). The test enabled a payout account and disabled it within the same second. The provider's events carry their time in whole seconds, and no request says that two events of the same second apply in the order they arrive. clean-1's tree ignores an event no newer than the last one applied, which the requests allow, and failed.
   - **The fix:** the second update now comes a second after the first.
   - **What it touched:**
     - clean-1's first attempt at 26 was graded again with the amended test, and passes: it is counted as delivered at the smallest step;
     - simple-1 and simple-2 had delivered 26 with the old test, which the amendment only loosens;
     - clean-2's escalation at 26 was the storm's command name, untouched by this.
2. **Request 30, the provider's refund without its body** (2026-11-02, 13:27 UTC). Request 30 asks for a refund through the provider's `POST /refunds` "of request 26". The body of that call is in request 26, which the agent at feature 30 does not see. The agents guessed the field that names the payment:
   - simple-1 and simple-2 sent `paymentId`;
   - clean-2 sent no payment at step 0, and `paymentId` at step 1;
   - clean-1 sent `payment`, the provider's word, and delivered.

   - **The fix:** request 30 gives the call and its webhooks in a table of its own, as request 26 does.
   - **What it touched:**
     - simple-1, simple-2 and clean-2 were stopped:
       - simple-1 on its step-1 attempt;
       - simple-2 grading its step-0 attempt;
       - clean-2 grading its step-1 attempt.
     - Their attempts at 30 are kept under `refs/amend2/` in each tree, and their cost is counted.
     - They were resumed with the amended request: 30 again from the smallest model, under what was left of each ceiling. Their escalations at 30 before the amendment are not counted.
     - clean-1 is untouched. Its escalation at 30 was its own end-to-end suite failing under load, and the replay does not cover that.
3. **Request 37, the provider's transaction types** (2026-11-02, 20:18 UTC). Request 37 compares the application's movements with the provider's transactions "by `type`". It named the movements in words ("each payment, fee, refund and payout"), and the provider's values for `type` were listed only in request 26, which the agent at feature 37 does not see. simple-1 named a payment `payment`, where the provider says `charge`.
   - **The fix:** request 37's table now lists the types: `charge` (a payment), `fee`, `refund`, `payout`, `dispute`.
   - **What it touched:**
     - simple-1 was stopped just after its step-1 attempt at 37 had started. Its attempts are kept under `refs/amend3/`, and their cost is counted.
     - It was resumed at once with the amended request, from the smallest model, under what was left of its ceiling. Its escalation at 37 is not counted.
     - clean-1 had delivered 37 at the smallest step before the amendment, which only adds what the provider already answers.
     - No other tree had reached 37.
   - **The other requests were checked for the same defect:** every later request that uses the provider gives the calls, bodies and webhooks it needs (31, 33, 39).
4. **Test 47, a schedule before the payout account** (2026-11-03, 00:40 UTC). The test chose a weekly schedule before the host had opened a payout account. Request 47 does not say whether a host may do that, and the storm puts the schedule on the payout account. clean-1 followed the storm and refused the schedule until an account exists.
   - **The fix:** the test opens the account before choosing the schedule.
   - **What it touched:**
     - clean-1's step-0 attempt at 47 passes the amended test: it is counted as delivered at the smallest step, as with amendment 1.
     - The ladder had already moved to step 1.
     - The amended test passes on the solvability tree.
     - No other tree had reached 47.
