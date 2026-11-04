# OpenStay's J5 kit: fifty more features and eight side experiments, written and rehearsed before any run

J5 runs requests 51 to 100 of [OpenStay](../README.md) on the six trees of [J4](../j4/README.md), from their J4 heads, each feature from the smallest model up. The trees are graded on every request up to the feature after each attempt, so a later feature that breaks an earlier one is a regression. The eight side experiments run beside the ladder, on copies of the trees. This kit is written, reviewed and rehearsed before any agent runs it.

The phase is the framing's phases 3 and 4 ([j0](../j0.md#the-later-phases)):
- the complete marketplace: messaging, reviews, moderation, claims, support, sustainability;
- internationalisation: languages, currencies, local rules, taxes, calendar sync;
- a rule of the brief that changes, not announced in advance.

## The maintainer's decisions (2026-11-04)

- **The fifty features of [the proposal](proposal.md),** in its order. Request 90, card fees passed on where the law allows, is the change not announced in advance: nothing in requests 51 to 89 says that the rule will change.
- **$900 for J5, firm:**
  - the ladder, $480: $50 per simple tree and $110 per Clean DDD tree;
  - the kit, $120;
  - the side experiments, $300.
- **The eight side experiments** as the proposal sets them.
- **The limited context is dropped if it cannot be held.** The kit rehearses a way to cap the agent's context at about 30,000 tokens. If none holds verifiably, the experiment does not run, and the record says so.
  - **The rehearsal showed** that the agent's fixed context alone is about 42,000 tokens ([`side/context-cap.md`](side/context-cap.md)). **The maintainer decided** that the experiment runs with about 30,000 tokens of work above it, checked in every transcript.

## What is in it

| Path | What it is |
| --- | --- |
| [`proposal.md`](proposal.md) | What was proposed to the maintainer, and accepted |
| [`backlog/`](backlog) | Requests 1 to 50 as J4 left them, and 51 to 100 |
| [`acceptance/`](acceptance) | The hidden tests, one file per request, 1 to 100, with their support: [`openstay.ts`](acceptance/openstay.ts) (the client, the servers, the clock, the notice service, the outside calendars, the files) and [`provider.ts`](acceptance/provider.ts) (the payment provider, now with currencies, a fee schedule and payouts that pause) |
| [`storms/`](storms) | The Clean DDD arm's storms: J4's fifty, done, and fifty more, with the session's strategic questions and hot spots, all accepted |
| [`review.md`](review.md) | The review of tests 51 to 100 by a fresh agent that had only the requests |
| [`side/`](side) | The side experiments' kits: the [context cap](side/context-cap.md), the [vague requests](side/vague/README.md), the [chaos suite](side/chaos/README.md) and the [change probes](side/probes/README.md) |

## How it was checked before use

- **The tests were written by a fresh agent from the requests,** and **reviewed by another** that had only the requests ([`review.md`](review.md)): 6 blocking findings, 8 weak, 6 on wording. Every blocking finding was fixed, the weak ones strengthened, and each wording finding closed in its request.
- **The tests are solvable.** Agents wrote requests 51 to 100 on the J4 solvability tree (`3b83518` to `c33599f`), in batches of ten, from the requests alone, told never to bend the code away from a request. They found these defects of the kit, each fixed before any run:
  - 63 signed up the same email twice; 66 read a booking with the token of an account it had just suspended, which 66 refuses; 79 sent its unsigned request with a token;
  - four older tests (35, 37, 38, 48) compared whole answers that the currencies of 87 and 89 add fields to; they now compare the fields they assert;
  - 97 failed three times in six under load, on the night a booking frees. It waited until the night's `source` was `import`, then asserted that the night was blocked too, so a tree read between the two failed. It now waits for both, up to a minute instead of 20 seconds.

  The solved tree passes all 101 files and `yarn verify`.
- **The trees' own checks pass on the kit's files.** The tests are formatted as the trees' Prettier formats them, and typecheck with unused imports refused, since a Clean DDD tree's gate runs its formatter and its type checker over them.
- **`dry-run` is clean** on the solvability tree before (`3b83518`) and after (`c33599f`), and on clean-1 at its J5 start (`885f154`):
  - no hygiene finding;
  - no test of 51 to 100 passing before its feature;
  - none failing on the solved tree.

  Its verdict reads `READ` only because 1 to 50 pass before; they are the earlier features, not new ones.
- **Each tree has a PostgreSQL server of its own,** in UTF-8, on its own port (55441 to 55446, simple-3 on 55432, its tests' default): one tree's teardown cannot drop another's databases, as clean-3's dropped clean-2's in J4. A server first made in `SQL_ASCII` failed every test of simple-2, whose schema sorts with a UTF-8 collation, before it was made again.
- **Every tree was graded on 1 to 50 and 25.1 at its J5 start,** after the J5 session in the Clean DDD trees. All six pass all 51 files. The three simple trees pass `yarn verify`. The Clean DDD trees' gate failed only on the formatting of test 93, since fixed. clean-3 still owes three storms, as it did at the end of J4.
- **The change probes are solvable** ([`side/probes`](side/probes/README.md#how-the-probes-were-checked)): each passes its own hidden test on the solvability tree, and 1 to 100 but for the five earlier cases P2 supersedes.

## Amendments

A defect of the kit found after the runs started is recorded here, applied to every tree alike, and the attempts it touched are graded again.
