# OpenStay's J3 kit: fifteen more features, written and rehearsed before any run

J3 runs requests 11 to 25 of [OpenStay](../README.md) on the six trees of [the pilot](../pilot/README.md), from their pilot heads, each feature from the smallest model up, as in J2. The trees are graded on requests 1 to 25 after every attempt, so a later feature that breaks an earlier one is a regression. This kit was written, reviewed and rehearsed before any agent ran it.

## The maintainer's decisions (2026-11-01)

- **The fifteen features,** in the order of [`backlog/backlog.yaml`](backlog/backlog.yaml). Request 24 (collaborators and permissions) is the change not announced in advance: nothing in requests 11 to 23 says that permissions will change.
- **$200 for J3, firm.** Each plan carries its ceiling: $45 per Clean DDD tree and $15 per simple tree, $180 in all.
- **No strongest-model witnesses** in J3.
- **The reference's relay fix reaches the Clean DDD trees** as a recorded commit before the runs, with an ADR in each tree, since the pilot found the defect in the reference (below).
- **The storms of 11 to 25,** every proposal accepted ([`storms/README.md`](storms/README.md)).

## What is in it

| Path | What it is |
| --- | --- |
| [`backlog/`](backlog) | Requests 1 to 10, the pilot's unchanged, and 11 to 25, in product words, each with its API. |
| [`acceptance/`](acceptance) | The hidden tests, one file per request, and their client [`openstay.ts`](acceptance/openstay.ts). 1 to 9 are the pilot's; 10 gains the kills below. |
| [`storms/`](storms) | The Clean DDD arm's storms: the pilot's ten, done, and fifteen more, decided with the maintainer. |
| [`review.md`](review.md) | The review of tests 11 to 25 by a fresh agent that had only the requests, and what was done with each finding. |

## What changed in the trees before the runs

Each Clean DDD tree got two commits on top of its pilot head, clean-2 a third, and the simple trees none.

| Tree | Pilot head | The relay | The J3 session |
| --- | --- | --- | --- |
| clean-1 | 62e67a8 | 67d53ce (ADR 11): the reference's fix, as it is | 159c51d (ADR 12) |
| clean-2 | f964724 | 75c025e (ADR 12): the reference's fix, as it is; then 141b51f (ADR 14): one notice per booking | a94a9c5 (ADR 13) |
| clean-3 | 3dd035b | 326fed7 (ADR 13): the reference's fix in the shape the tree's own ADR 11 gave its relay | 81b3aa0 (ADR 14) |

- **The relay.** The reference's fix was ported. clean-3 had already made its relay wait for the reactions. It still acknowledged a reaction that failed, and its bus decided each subscriber's inbox from the status every subscriber shares; only those two points were ported there.
- **Porting found a third defect, in the reference.** In TypeScript, Python and Rust, the relay's guard against handing out an entry still on its way was kept per outbox object. clean-2 and clean-3 build an outbox adapter for each unit of work, over the same table, which defeats such a guard. The reference now keeps the guard by entry id, with a test in each language that fails against the old code; Go already did. The trees got the id-keyed version.
- **clean-2's notices.** With the fixed relay, clean-2 no longer lost a notice under the aimed kills; it owed two for one booking, twice. A fact a crash interrupted is handed out again, and clean-2 has neither a durable inbox nor a unique key on the booking, which clean-1 and clean-3 have. The maintainer chose to fix it before the runs rather than leave the tree to stop at feature 11 on a defect older than J3. 141b51f makes the reaction owe nothing when a notice is already owed for the booking, and the table refuses a second one. This is tree code written by the experimenter, a bias the record names.
- **The session's commit** adds the language of the fifteen requests to the domain map, and an ADR: no new context, and organisations in Accounts.

## The chaos test gains aimed kills

The pilot's chaos test (request 10) killed the server at random delays after a booking was sent. That reached the relay's window once in four gradings. The pilot's record asked for a kill aimed at that window for J3: five more rounds now kill the server as soon as the booking is answered, when the booking is recorded and its notice may not yet be owed durably. The other rounds are unchanged.

## How it was checked before use

- **The tests discriminate.** On the pilot's heads (simple-1, and clean-1 after its relay commit), every test of 11 to 25 fails, and every test of 1 to 10 passes, as they must: they are the regressions.
- **The tests were reviewed by a fresh agent** that had only the requests ([`review.md`](review.md)): 3 blocking findings, 12 weak and 13 on wording. Every blocking finding was closed, nine weak ones became stronger tests, and every wording finding changed the request.
- **The tests are solvable.** An agent wrote the fifteen features on the pilot's solvability tree (`dcf5fea` to `9d38f9c`), from the requests, with the tests in view, told never to bend the code away from a request. Its tree passed all 25 files, 73 tests, twice, and `yarn verify`. It found no test that contradicts a request; the test of request 10 is looser than the request on the retry gaps, which is the pilot's.
- **The aimed kills discriminate.** On clean-2's pilot head (the old relay), they lost 5 notices; with the relay fixed and before 141b51f, they found two notices for one booking, twice. simple-1 passes them.
- **Every tree passes 1 to 10 at its J3 start,** aimed kills included, graded once each before the runs.
- **`dry-run` is clean** on the simple arm's solvability tree before and after, and on clean-1 at its J3 start: no hygiene finding, no test passing before its feature, none failing on the solved tree.

## Amendments

None yet. A defect of the kit found after the runs start is recorded here, applied to every tree alike, and the attempts it touched are graded again.
