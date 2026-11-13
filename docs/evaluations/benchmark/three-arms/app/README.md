# J6's application kit: Tally, checkpoints 1 and 2 (requests 1 to 20)

The application of the [three-arms protocol](../README.md): **Tally**, a group of people sharing expenses, written
from the [brief](brief.md) the maintainer approved on 13 November. It is the campaign's counted kit, in four
checkpoints of ten requests; this is **checkpoint 2 of 4**: checkpoint 1, groups and the ledger (requests 1 to 10),
accepted by the maintainer on 13 November, and checkpoint 2, settling up (requests 11 to 20), for the maintainer's
review. The calibration (OpenStay 1 to 10,
run first and not counted) is a separate kit, [`../calibration`](../calibration/README.md).

No arm was tuned on it: its domain is none of the three arms' guides' examples, and its requests were written after
the arms' rules. Every arm's agents receive one request at a time with its API fragment (`api/<n>-<id>.yaml`); the
Lite and Full arms also the feature's storm. The hidden tests, the brief and this README are never given to an agent.

## What is in it

| Path | What it is |
| --- | --- |
| [`brief.md`](brief.md) | The approved brief: the product, the actors, the candidate contexts, the invariants, the outline of the forty requests. |
| [`backlog/`](backlog) | The twenty requests of checkpoints 1 and 2 and `backlog.yaml`. Request 1 fixes how the API works, as the calibration's request 1 does; requests 10 and 20 are the changes not announced in advance (below). |
| [`api/`](api) | One fragment per request with an API table (1 to 9, 11 to 13, 15 to 19; requests 10, 14 and 20 change no route): its resources, the routes that answer them by status, and, from request 1, what any route may answer (`202 { operationId }`, a `4xx`; never a `5xx`). |
| [`conventions.yaml`](conventions.yaml) | Every convention a later request relies on (36 born in checkpoint 1, 32 in checkpoint 2), with the request that sets it and the test that holds it there. |
| [`acceptance/`](acceptance) | The hidden tests, one file per request (51 tests in checkpoint 1, 41 in checkpoint 2), and their client [`tally.ts`](acceptance/tally.ts): the calibration's harness (`start`, `stop`, `kill`, `database`, `eventually`, `bySweep`, `client`, `hidden`, `holdToApi`) with Tally's resources (`person`, `group`, `invite`, `join`, `groupOf`, `expense`, `shares`, `balances`; from checkpoint 2 `cash`, `payThrough`, `settlement`, `notices`), two additions of checkpoint 1, `reached` and `keepsTheSplit`, and two of checkpoint 2, `paymentProvider` (the provider the tests play) and `payable` (below). |
| [`storms/`](storms) | One storm per request, in the inventory's words, and each checkpoint's session's [hot spots](storms/README.md), decided by the operator for the maintainer. |
| [`dry-run.json`](dry-run.json) | The rehearsal's report, on a plain witness tree (below). |

## The requests

| n | Request | Contexts (the storms') | What it holds |
| --- | --- | --- | --- |
| 1 | Accounts, and how the API works | Groups | the API's conventions; durability on a killed server |
| 2 | Create a group | Groups | the currency fixed, its minor unit; a group seen by its members only |
| 3 | Invite by a link, and join | Groups | a link anyone signed in may use; the members in the order they joined |
| 4 | Record an expense, split equally | Ledger, Groups | the split adds up; the remainder to the payer; the payer in the split |
| 5 | A group's balances | Ledger, Groups | the zero sum, with twenty expenses at once on two servers |
| 6 | Edit and delete an expense | Ledger, Groups | the payer or the owner; a version; of two edits at once, one wins, the other is refused by name |
| 7 | Unequal splits | Ledger | exact amounts that add up; whole shares; the kind read back |
| 8 | A group's expenses, and a member's statement | Ledger, Groups | two lists in stated, opposite orders; a running balance |
| 9 | Leave a group | Groups, Ledger | only at a balance of 0; the owner stays; a former member's expenses frozen |
| 10 | **[U]** The remainder goes to the first member of the split | Ledger | the new rule from now on; shares kept as decided |
| 11 | Suggested settlements | Settlements, Ledger, Groups | a stated algorithm, its order and ties; a read changes nothing |
| 12 | Settle up in cash | Settlements, Ledger, Groups | no overpayment, two at once on two servers; counted at once; the zero sum |
| 13 | Pay through the payment provider | Settlements, Ledger, Groups | a link from the provider the tests play; a signed webhook; a pending payment counts as paid for what is still owed |
| 14 | Webhooks late, twice or out of order | Settlements | one payment, one effect: twice, under two ids, out of order, after a restart, at once on two servers |
| 15 | Refund through the provider | Settlements, Ledger, Groups | refunding still counted, refunded not; only the payee; frozen for a former member |
| 16 | Payout accounts | Settlements | the provider knows it; required to be paid through it, refused by name before the provider is asked |
| 17 | Notices | Notifications, Ledger | one per member of the split but the payer, soon, across a killed server |
| 18 | Reminders | Notifications, Settlements | at the sweep, never at a read; once a period, on two servers; what is still owed |
| 19 | A group's settlements | Settlements, Groups | the most recent first; each status had, a webhook that changes nothing adds nothing |
| 20 | **[U]** Leave with a balance | Groups, Ledger, Settlements | what is left passes to the owner in one step; an expense and a leave at once (T5's gap, closed) |

**The change not announced in advance (request 10).** Requests 1 to 9 say the remainder goes to the payer and
nothing else: no word of an order that matters for the remainder, no rule "for now". Request 4 says the shares are
read in the order the split was given, because a client shows them that way; that is what lets request 10 name
"the member listed first" without changing the API.

**The change not announced in advance (request 20).** Requests 11 to 19 say nothing of leaving: request 12 says that
leaving counts the settlements (request 9's rule, unchanged), request 15 that a settlement of a member who left is not
refunded, as request 9 freezes their expenses. None says "for now", and none names a payment that waits as a reason
not to leave: request 20 brings that rule with the change.

## How it is checked

- **`node .claude/flow/kit-check.mjs docs/evaluations/benchmark/three-arms/app`: clean** (13 November, both
  checkpoints). Every request with an API
  table has its fragment and every route of its table composes; every convention has its `born` and its `it`; the
  operation composed is the contract's (`error: { type, message }`), so no difference is printed. No fragment adds a
  state to an enum in checkpoint 1 (Tally's states come with settlements and archiving); each resource is read whole,
  through the client, by the tests of the request that defines it. In checkpoint 2, requests 13, 15 and 18 add
  states (a settlement's `provider` method, its `pending`, `failed`, `refunding` and `refunded` statuses; a notice's
  `reminder` kind), each read whole by the test its fragment names.
- **The storms:** each is legal against the contract and a map that declares Groups and Ledger
  ([how](storms/README.md#how-they-were-validated)); from checkpoint 2, Settlements and Notifications too, with the
  relationships of [the session](storms/README.md#the-strategic-session) and request 20's own.
- **`yarn check:conventions`** at the repository's root resolves every link in these files.
- **The kit's TypeScript** passes the formatter, the linter and the type checker of the plain project the simple arm
  starts from (the calibration's `simple-w` starting commit, the same `package.json`), with the `ajv` 8 its Fastify
  brings.
- **The rehearsal** ([`dry-run.mjs`](../../../../../.claude/flow/dry-run.mjs), report in [`dry-run.json`](dry-run.json)),
  13 November, on a witness tree of the simple arm's kind: the plain project (`created: plain`, as OpenStay's
  `trees/simple-w` starts: `src/server.ts`, Fastify, `yarn verify`), and one commit that solves requests 1 to 10
  from their text, with `node:sqlite`, every change answered at once. The witness was written after the requests and
  their fragments and before the tests, from the requests alone. Its verdict, clean, is in [the rehearsal](#the-rehearsal).

## Decided by the operator, for the maintainer to review

Where the brief's outline is terse, the operator decided in its spirit. Each is a line to accept or change before
the kit is registered.

**The product (the requests).**
1. **A name on the account** (1 to 60 characters), so that the members list says who is who; no roles: the owner is
   per group (request 2), the administrator comes later and is not a sign-up.
2. **Currencies:** `EUR`, `USD`, `GBP`, `CHF`, `CAD`, `AUD`, each counted in hundredths (request 2). Request 40 will
   change precision; request 2 states a fact of these six currencies, not a rule "for now".
3. **No renaming and no other change of a group** in checkpoint 1: "the currency is fixed" is said, and no route
   changes it.
4. **"My groups"** are the groups one is a member of now, the most recently created first, a joined group at its
   place by its creation (requests 2 and 3).
5. **An invitation** is a link any member creates, used by anyone signed in, any number of times, never expiring and
   never revoked in checkpoint 1; its id is the link, at least 16 characters (request 3). Joining twice is refused.
6. **The members** are listed in the order they joined, the owner first; a member who leaves and joins again is last
   (requests 3 and 9).
7. **The payer is the member who records the expense,** and is always in the split (request 4), whatever its kind
   (request 7 lets their exact amount be 0). Without this, "the remainder to the payer" has no meaning when the
   payer is not in the split.
8. **An expense:** a description of 1 to 100 characters, an amount from 1 to 100 000 000, a date that is a real day
   not after today in UTC, members listed once (request 4).
9. **The rounding:** each share rounded down, the whole remainder to one member (the payer, then the first member,
   request 10), for an equal split and a split by shares alike (requests 4 and 7). Exact amounts are 0 or more.
10. **The balance's sign:** positive when the group owes the member (request 5). The balances list every current
    member in the order they joined.
11. **The edit's version is the client's** (request 6): an edit gives the version it was made from, and one from a
    version gone is refused. That is what makes "two edits at once: one wins, the other is refused by its rule's
    name" a rule a client sees, rather than a last write winning. The edit replaces the expense whole; the payer
    never changes, even when the owner edits.
12. **A deleted expense is gone** (`404`), not a state.
13. **The three splits are three fields** (`splitBetween`, `splitExactly`, `splitByShares`), exactly one given; none
    or two is the body's shape, `400` (request 7). The expense gains `splitKind`.
14. **The two lists of request 8 run in opposite orders:** the group's expenses the latest date first, then the most
    recently recorded first; a statement the earliest first, as a bank statement, with each entry's running balance.
    Any member reads any member's statement, a former member's included (request 9).
15. **Leaving** (request 9): refused at a balance other than 0 and for the owner; once gone, the group is `404` to
    them, and an expense that concerns someone who is no longer a member is neither edited nor deleted, so the
    balances among the current members still add up to 0. Without it, an edit by the owner could leave a former
    member with a balance nobody sees.
16. **Request 10:** an expense edited after the change is split again by the new rule; earlier expenses keep their
    shares.
17. **Request 1 says the sweep** (`JOBS_INTERVAL_SECONDS`, never at a read), as the maintainer's decisions of 13
    November fix it for J6, although nothing in checkpoint 1 changes with time. Registered as `sweep`, born at 1, its
    test holding the half that exists (a read changes nothing while the job runs).

**The model (the storms):** T1 to T5 and each feature's hot spots, in [`storms/README.md`](storms/README.md). The
ones to read first:
- **T1, accounts in Groups,** not a fifth context.
- **T3, the brief's [X] at request 3 moves to request 4:** Ledger asks Groups for the members through a port when it
  decides, so no integration event is published when someone joins.
- **T5, two ports in opposite directions** between Groups and Ledger, and the gap it leaves (an expense and a leave
  at the same moment), which request 20 reopens.

**The tests.**
- **Superseded cases.** Request 10 changes a rule requests 4 and 7 assert. The ladder grades every earlier request
  again after each new one (`grade.mjs --upto`), so an assertion of request 4 that request 10 overturns would fail
  on every correct tree from request 10 on. The client's `reached(n)` reads the request graded from the composed
  API (`upto`; graded whole, every request is reached), and the cases of tests 4 and 7 that put the payer elsewhere
  than first assert the payer's remainder only before request 10; from 10 on they assert what request 10 keeps
  (`keepsTheSplit`: the order, the shares adding up, the remainder whole to one member). The cases with the payer
  listed first hold under both rules and assert the exact shares always. This is J5's "earlier cases a probe
  supersedes" ([J5's probes](../../openstay/j5/side/probes/README.md#the-earlier-cases-p2-supersedes)), made
  mechanical: two cases, in two tests, named in the register (`remainder-to-the-payer`).
- **What one tree cannot show.** "Earlier expenses are not computed again" is about expenses recorded by the tree
  before request 10 was written: a hidden test graded on one commit has no such expenses, since its database is made
  by the tree under test. Test 10 holds it with the tree before it (the upgrade step, below). Graded without that
  tree (`previous: null` in the grader's report), the case runs the graded tree in both places and holds nothing.
- **Durations.** A test that requires an order by time sleeps 1.1 s between the two events it orders, as the
  calibration's do, for a tree that keeps times to the second.

## Decided by the maintainer before checkpoint 2 (13 November)

The maintainer accepted checkpoint 1 as written, the operator's decisions above with it, and the operator's
recommendation on each question:

1. **The not-recomputed half of request 10 is held, by an upgrade step.** A request marked `upgrade: true` in
   `backlog.yaml` changes what a tree already stored; its test records through the tree as it stood before it and
   reads through the tree graded, on one database. `grade.mjs --previous <id>=<ref>` checks that earlier tree out
   beside the graded one and names it to the tests (`ACCEPTANCE_PREVIOUS`, read by `previous(id)` in
   [`tally.ts`](acceptance/tally.ts)); the ladder passes the commit the feature's attempts started from, as it
   logged it at `feature-start`, at every grading up to the end of the run; `kit-check` refuses an `upgrade` whose
   test never starts the tree before it. Test 10 gained the case (*keeps the shares of the expenses recorded before
   the change, on the same database*). Requests 20, 30 and 40 are marked the same way when they are written.
2. **T1:** accounts stay in Groups.
3. **T2:** Settlements and Notifications are declared at checkpoint 2's session, before request 11.
4. **T5's gap is closed at request 20,** which reopens leaving, with a hidden test that sends an expense and a leave
   at once.
5. **A request crosses contexts when its storm says so** (the links it uses): the storms are what the code is held to;
   the brief's marks are the outline's. Request 3's mark moves to request 4.
6. **`reached`** is accepted as the superseded cases' mechanism.

## Decided by the operator for checkpoint 2, for the maintainer to review

Where the brief's outline of requests 11 to 20 is terse, the operator decided in its spirit, held to the maintainer's
decisions above (T2, T5's gap, the storms' crossings, `reached`, `upgrade`). Each is a line to accept or change.

**The product (the requests).**
1. **The suggestion** (request 11) is a stated greedy algorithm (the most owing pays the most owed the smaller of the
   two, ties to the member who joined first), listed in the order made: "the fewest transfers" of the brief becomes
   "never more than one fewer than the members not even". The true minimum is a hard problem that two trees would
   answer with different transfers, and a test could not hold one answer.
2. **What is owed is the group's** (request 12): Tally keeps no debt between two members, so a settlement is at most
   what the payer owes (the opposite of their balance) and at most what the payee is owed (their balance).
3. **A settlement in cash is recorded by its payee** (`POST /v1/groups/{id}/settlements/cash { from, amount }`), who
   received the money; one through the provider is asked for by its payer (`.../settlements/provider { to, amount }`).
   A payer could otherwise claim a payment the payee never had.
4. **A settlement counts at once** (request 12): a read right after the command, or after the webhook's
   acknowledgement, sees it (`settled-at-once`); the tests do not wait, as they do not for an expense.
5. **A member's statement stays the expenses'** (request 12 says so): its balance then differs from the group's by
   the settlements (and from request 20 by what passed to the owner). Settlements in a statement would change the
   shape of request 8's entries; request 19's list is where they are read.
6. **The provider** is named by `PROVIDER_URL` and `PROVIDER_WEBHOOK_SECRET`, asked while the command decides (5
   seconds at most; anything else refuses the command and keeps nothing), with three calls: a payment
   (`POST /payments`), a refund (`POST /payments/{id}/refunds`) and a payout account (`GET /accounts/{id}`). There is
   no retry: a provider that is down makes the request refused, and the member asks again.
7. **The webhook** is `POST /v1/provider/webhooks { id, paymentId, status, at }`, signed by `Provider-Signature`, the
   lowercase hex HMAC-SHA256 of the body as sent; unsigned or wrongly signed, `401`. A signed webhook is always
   acknowledged with a `2xx`, one about a payment Tally does not know included, so that the provider stops sending it.
8. **A payment moves forward only** (requests 13 to 15): pending, then succeeded or failed, then refunded; a failed
   payment is over (a new link is a new settlement), and a `refunded` that overtakes the `succeeded` of its payment
   leaves the settlement refunded. One payment, one effect is then a property of the status, not of webhook ids.
9. **"What is still owed"** (request 13): a payment waiting at the provider counts as paid for the rule of a
   settlement, for the suggestions and for reminders, never for the balances.
10. **A refund** (request 15) is whole, by the payee only, of a paid settlement through the provider; `refunding`
    still counts, `refunded` does not. A settlement whose payer or payee left is not refunded, as request 9 freezes a
    former member's expenses.
11. **The payout account** (request 16) is set at `PUT /v1/accounts/me/payout-account { accountId }`, checked with the
    provider, read at `GET` (404 when none); from request 16 it is required to be paid through the provider, before
    the provider is asked, and Tally's payment request gains `payee`.
12. **Notices are kept by Tally** (request 17), read at `GET /v1/notices`, not sent to an outside service: the
    calibration's request 10 already tests an unreliable outside service, and checkpoint 4's preferences (36) need
    kinds Tally keeps. The payer gets none; edits and deletions make none; a notice stays its person's after they
    leave; "soon" is within seconds, without the job (the tests read for 15 s).
13. **The reminder threshold is fixed** (request 18): more than 2000 hundredths, 20.00 in every currency of request 2,
    not a setting of the group. "For a week" is "every run has seen it since a run a period ago"; the period is
    `REMINDER_PERIOD_SECONDS` (a week when not set; 3 on the tests' servers), so that a test does not wait a week.
14. **A settlement's history** (request 19) is on every read of a settlement, its list included: each status it has
    had in Tally, with when Tally learned it.
15. **Request 20:** what passes is the leaving member's balance at the moment they leave; the owner never leaves; a
    member does not leave while a settlement of theirs is pending or refunding (a payment landing after would change
    a former member's balance), which request 20 brings with the change. **It is not an upgrade:** every member who
    left before it left at a balance of 0 (request 9's rule), so nothing stored reads differently and nothing passes
    for them; its test needs no tree before it, and the witness no commit at request 19 for it.

**The model (the storms):** T6 to T11 and each feature's hot spots, in
[`storms/README.md`](storms/README.md#checkpoint-2-the-session-before-request-11). The ones to read first:
- **T7, a `SettlementBook` per group** holds "no overpayment" against two settlements at once.
- **T8, Ledger reads what is settled** through a port, rather than being told by an integration event: the brief's
  "it tells Ledger a payment landed" becomes "Ledger asks", so that no decision reads a balance that lags.
- **T10, request 20's relationship is declared by its storm,** not at the session, or the starting trees of
  checkpoint 2 would announce it; T5's gap is closed there, on the one database.

**The tests.**
- **The provider is played by the tests** (`paymentProvider()` in `tally.ts`): an HTTP server of the test's own, which
  records what Tally asks, answers with a link, refuses while `refusing`, and signs the webhooks each test sends when
  it chooses: twice, under two ids, out of order, while the server is killed and after it starts again, at once to two
  servers.
- **Superseded cases, by request 16:** from request 16, being paid through the provider needs a payout account. The
  cases of tests 13 to 15 and 18 to 20 that pay through the provider make the payee payable first (`payable`), only
  once request 16 is reached (`reached(16)`); before it, the route does not exist and nothing is needed.
- **Superseded cases, by request 20:** test 9's first case asserts that a member with a balance cannot leave; from
  request 20 those two refusals are not asserted (`reached(20)`), and the rest of the case holds under both rules.
  Test 12 lets a member leave only once even, which holds under both.
- **Reminders by the sweep:** test 18 starts its servers with a period of 3 seconds and reads with `eventually` until
  `bySweep`; a reminder is never earlier than a period, less a second, after the run that could first see the debt.
  Its last case starts a server whose job runs once an hour, and reads the debt again and again: nothing.
- **Request 20's race:** nine rounds, through one server and two, of a leave sent with an expense the owner records
  with the leaving member, an expense the leaving member records, or a settlement in cash from them. Whichever is
  kept, the owner and the remaining member's balances are known in advance, so a tree that passes what it read
  before the expense was counted fails there.

## Decided by the maintainer before checkpoint 3 (13 November)

The maintainer accepted checkpoint 2 as written, and the operator's recommendation on each question:

1. **T8:** Ledger keeps reading the settled amounts through the port it owns; an integration event is reconsidered
   only if requests 24 or 28 need a fact to react to.
2. **T7's gap** (an expense deleted at the moment a settlement is decided) is accepted and documented, not tested.
3. **Settlements enter a member's statement at request 29,** with the CSV export, so the export is not expenses
   alone.
4. **An unannounced request's storm may declare a new relationship** between contexts (T10): it is part of what the
   change costs, and what J6 measures.
5. **The reminder threshold stays fixed** (2000 hundredths); request 24's budgets are another rule.
6. **Request 30's upgrade test** asks for a payment link through the tree before the change and lands its webhook
   through the tree after, on the same data: a payment in flight crosses the change of storage and counts once.
7. **A witness that answers later (`202`)** is rehearsed before registration, on the Lite and Full starting trees,
   once the four checkpoints are written.

## The rehearsal

[`dry-run.mjs`](../../../../../.claude/flow/dry-run.mjs) on 13 November, with the composed API in force
(`API_SCHEMA`), on one witness tree of the simple arm's kind (`tally-w`, arm `P`, graded with `--control plain`):
`d859700` (`created: plain`, the plain project as OpenStay's `trees/simple-w` starts it) and `2778fc9` (requests 1
to 10 solved from their text). The witness lives in the operator's scratch space, not in this repository; its two
commits are what the report names. **Verdict: clean, no finding.**

- **Discrimination:** all ten files fail on the starting tree.
- **Solvability:** all ten files, 50 tests, pass on the solved tree, at the first run: no test had to change for the
  witness, and the witness did not have to change for a test.
- **Hygiene:** the kit's files raise nothing in the tree's formatter, linter or type checker.
- **The superseded cases, graded as the ladder grades them** (`grade.mjs --upto`, beside the dry run): on a variant
  of the witness that gives the remainder to the payer (the tree as it would stand after request 9), tests 4 and 7
  pass graded up to 9 and test 10 fails (4 of its 4 tests); on the solved tree, tests 4 and 7 fail graded up to 9
  (one case each, the payer elsewhere than first) and pass graded whole. So request 4's rule is held at request 4,
  and request 10's at request 10, by the same files.
- **Not rehearsed:** a tree that answers commands later (`202`): the witness answers every change at once, as the
  calibration's `simple-w` did, so the operation's half of request 1's and 2's tests and the `ERROR` branches of
  tests 1 and 6 ran on their "at once" side only. A Lite or Full witness, before registration, would run them; the
  calibration's `clean-w` rehearsal is the evidence that the same harness reads them.

### Checkpoint 2 (13 November)

The same tool, on the same witness, with the plan updated to the new solved commit: `d859700` before, and `bb0c3e9`
(requests 11 to 20 solved from their text, on top of `2778fc9`), with `previous` for request 10 only (`13ceb79`):
request 20 is not an upgrade, so the witness has no commit at request 19 for it. The witness was written from the
requests and their fragments, before the tests: `node:sqlite` as before, the provider called with a five-second
limit, the webhook's signature checked over the body as sent, a background job every `JOBS_INTERVAL_SECONDS` for
reminders, and leaving with a balance written in the transaction that ends the membership. **Verdict: clean, no
finding**; [`dry-run.json`](dry-run.json) is this rehearsal's report, both checkpoints in it (checkpoint 1's report
above was replaced by it).

- **Discrimination:** all twenty files fail on the starting tree.
- **Solvability:** all twenty files pass on the solved tree, checkpoint 1's ten among them (test 9 with its
  superseded cases, below), at the first run: no test had to change for the witness, and the witness did not have to
  change for a test.
- **Hygiene:** the kit's files, `tally.ts`'s provider included, raise nothing in the tree's formatter, linter or type
  checker.
- **Request 20's superseding, graded as the ladder grades it** (`grade.mjs --upto`): on a variant of the witness
  that refuses a member with a balance (`11b7cf1`, the tree as it would stand after request 19), test 9 passes graded
  up to 19 (5 of 5) and test 20 fails (4 of 4); on the solved tree, test 9 fails graded up to 19 (its first case, the
  two refusals `reached(20)` keeps from request 20 on) and passes graded whole, beside test 20 (4 of 4). So request
  9's rule is held at request 9, and request 20's at request 20, by the same files.
- **Request 16's superseding, the same way:** on a variant that pays without a payout account (`74a6ef5`, the tree
  as it would stand after request 15), tests 13, 14 and 15 pass graded up to 15 (14 of 14) and test 16 fails (its two
  cases that require the account); on the solved tree, which requires one, they fail graded up to 15 (`payable` does
  nothing before request 16) and pass graded whole.
- **Not rehearsed, still:** a tree that answers commands later (`202`). The webhook acknowledged by an operation, the
  notices of a reaction relayed from an outbox, and the race of request 20 across contexts are where a Lite or Full
  witness would show what the plain one cannot.
