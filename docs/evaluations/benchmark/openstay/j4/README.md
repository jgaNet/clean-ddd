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

To be filled in as the checks complete.

## Amendments

None yet.
