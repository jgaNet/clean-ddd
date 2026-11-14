# J6's application kit: Tally, checkpoints 1 to 4 (requests 1 to 40)

The application of the [three-arms protocol](../README.md): **Tally**, a group of people sharing expenses, written
from the [brief](brief.md) the maintainer approved on 13 November. It is the campaign's counted kit, in four
checkpoints of ten requests; this is **checkpoint 4 of 4**: checkpoint 1, groups and the ledger (requests 1 to 10),
and checkpoint 2, settling up (requests 11 to 20), accepted by the maintainer on 13 November, checkpoint 3,
currencies and recurring expenses (requests 21 to 30), accepted on 14 November, and checkpoint 4, across groups and
people (requests 31 to 40), for the maintainer's review. The calibration (OpenStay 1 to 10,
run first and not counted) is a separate kit, [`../calibration`](../calibration/README.md).

No arm was tuned on it: its domain is none of the three arms' guides' examples, and its requests were written after
the arms' rules. Every arm's agents receive one request at a time with its API fragment (`api/<n>-<id>.yaml`); the
Lite and Full arms also the feature's storm. The hidden tests, the brief and this README are never given to an agent.

## What is in it

| Path | What it is |
| --- | --- |
| [`brief.md`](brief.md) | The approved brief: the product, the actors, the candidate contexts, the invariants, the outline of the forty requests. |
| [`backlog/`](backlog) | The forty requests of checkpoints 1 to 4 and `backlog.yaml`. Request 1 fixes how the API works, as the calibration's request 1 does; requests 10, 20, 30 and 40 are the changes not announced in advance (below). |
| [`api/`](api) | One fragment per request with an API table (1 to 9, 11 to 13, 15 to 19, 21 to 29, 31 to 40; requests 10, 14, 20 and 30 change no route): its resources, the routes that answer them by status, and, from request 1, what any route may answer (`202 { operationId }`, a `4xx`; never a `5xx`). |
| [`conventions.yaml`](conventions.yaml) | Every convention a later request relies on (36 born in checkpoint 1, 32 in checkpoint 2, 26 in checkpoint 3, 25 in checkpoint 4), with the request that sets it and the test that holds it there. |
| [`acceptance/`](acceptance) | The hidden tests, one file per request (51 tests in checkpoint 1, 41 in checkpoint 2, 41 in checkpoint 3, 32 in checkpoint 4), and their client [`tally.ts`](acceptance/tally.ts): the calibration's harness (`start`, `stop`, `kill`, `database`, `eventually`, `bySweep`, `client`, `hidden`, `holdToApi`) with Tally's resources (`person`, `group`, `invite`, `join`, `groupOf`, `expense`, `shares`, `balances`; from checkpoint 2 `cash`, `payThrough`, `settlement`, `notices`), two additions of checkpoint 1, `reached` and `keepsTheSplit`, two of checkpoint 2, `paymentProvider` (the provider the tests play) and `payable` (below), and those of checkpoint 3: `ratesService` and `receiptStore` (two more outside systems the tests play), files (`JPEG`, `PNG`, `PDF`, `padded`, the client's `upload` and `raw`), days by the month (`monthly`, `monthsFrom`), a PostgreSQL database beside each file from request 30 (`database`, `POSTGRES`), and a client that does not hold an earlier tree's answers (`client(port, false)`); and those of checkpoint 4: the provider's fee on each payment it makes (`state.fee`) and what the PostgreSQL database holds of a text (`holds`). |
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
| 21 | An expense in another currency | Ledger, Groups | a rate as a decimal string, a half up; the rate and both amounts kept as given; `original` absent otherwise |
| 22 | Rates offered by a rates service | Ledger, Groups | a service the tests play; the offer taken, or a rate within 2 %, refused by name beyond; no service, the payer's rate |
| 23 | Recurring expenses | Ledger, Groups | at the sweep, never at a read; every day that has come, once, on two servers and across a restart; ended by a leave |
| 24 | Budgets | Ledger, Groups, Notifications | a month by the expenses' dates; one notice per member, category and month, soon, across a killed server |
| 25 | Split templates | Ledger, Groups | split as if given; the expense keeps its shares; names free in the group, whatever their case |
| 26 | Receipts | Ledger, Groups | a store the tests play; a JPEG or a PNG by its first bytes, 1 byte to 2 MB; nothing sent when refused |
| 27 | Archive a group | Groups, Ledger, Settlements | once even and nothing waiting; eighteen writes refused by one name; the sweep records nothing |
| 28 | An audit of money changes | Ledger, Settlements, Groups | six actions, who, when, how much; with the change, across a kill, once on two servers |
| 29 | A statement as CSV | Ledger, Settlements, Groups | settlements in the statement while counted; a stated column order, CRLF, quoting only where needed |
| 30 | **[U]** Storage on PostgreSQL | all four | `DATABASE_URL`; the file moved once, a payment in flight counted once; an upgrade |
| 31 | Merge two groups | Groups, Ledger, Settlements | the owner of both, one currency; the group merged gone at once, its money moved within seconds, the zero sum at every moment; an expense and a merge at once on two servers |
| 32 | Net debts across groups | Settlements, Ledger, Groups | a stated rule, the groups' order; settlements that count at once; all or nothing, once on two servers |
| 33 | Contest a settlement | Settlements, Ledger, Groups | administrators by `ADMIN_EMAILS`; held, waiting, not counted; paid again or annulled, once; always logged |
| 34 | Suspend a member | Groups, Ledger, Settlements | five starts refused by one name in every group; nothing written in a group; its recurring days wait |
| 35 | Delete an account | Groups, Ledger, Settlements | name and email in no table; the id and the balances kept; anonymous member, free email |
| 36 | Notice preferences | Notifications | per person and kind, on until off; nothing missed made later; a reminder not made not counted |
| 37 | Spending insights | Ledger, Groups | one's shares by month, currency and category, in a stated order; current groups only |
| 38 | Who bears the provider's fee | Settlements, Ledger, Groups | the provider's `fee`; the owner decides, the payee by default; what a payment settles, fixed when asked |
| 39 | Settle up in another currency | Settlements, Ledger, Groups | the rate offered when decided, kept; the provider asked in that currency; a payment landing later counts what was decided |
| 40 | **[U]** Currencies with no minor unit, or three decimals | all four | ten currencies; a rate per unit, written in the minor unit; the reminders' 20 of the currency; an upgrade |

**The change not announced in advance (request 10).** Requests 1 to 9 say the remainder goes to the payer and
nothing else: no word of an order that matters for the remainder, no rule "for now". Request 4 says the shares are
read in the order the split was given, because a client shows them that way; that is what lets request 10 name
"the member listed first" without changing the API.

**The change not announced in advance (request 20).** Requests 11 to 19 say nothing of leaving: request 12 says that
leaving counts the settlements (request 9's rule, unchanged), request 15 that a settlement of a member who left is not
refunded, as request 9 freezes their expenses. None says "for now", and none names a payment that waits as a reason
not to leave: request 20 brings that rule with the change.

**The change not announced in advance (request 30).** Requests 21 to 29 keep request 1's SQLite file and say nothing
of storage: two outside systems (22, 26) are named by their variables, and request 23's "however many servers run on
the database, even when the server is stopped" is request 1's durability, nothing more. Request 30 says the move in one
sentence, as OpenStay's request 40 did, and, unlike OpenStay's, asks that what the file held moves with it, so that it
is an upgrade (the maintainer's decision 6 of checkpoint 3): its test asks for a payment through the tree before it
and lands the provider's webhook through the tree graded.

**The change not announced in advance (request 40).** Requests 31 to 39 keep request 2's six currencies and their
hundredths, and say nothing of precision: request 38 says the provider's fee is in "the hundredths of the payment's
currency", and request 39 converts "as for an expense (request 21)", both facts of the six currencies, neither a rule
"for now". Request 40 brings four currencies, two with no minor unit and two with three decimals, and says what every
earlier rule that counted in hundredths becomes: a conversion reads an amount in its currency's units, the reminders'
threshold is 20 of the group's currency. It is an upgrade (`upgrade: true`): every amount a tree kept before it, in
hundredths, reads the same after it, and its test records through the tree at request 39.

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
- **Checkpoint 3:** kit-check clean on all three checkpoints (14 November); request 24 adds a notice's `budget` kind,
  read whole by the test its fragment names; requests 21, 24, 27 and 29 restate the expense, the notice, the group and
  the statement whole where a field is given in some states only (`original`, a budget notice's fields, `archivedAt`, a
  settlement entry's `settlementId`). The thirty storms are legal against the map of request 20, which checkpoint 3
  does not change. The kit's TypeScript, the new helpers included, raises nothing in the witness's checks.
- **Checkpoint 4:** kit-check clean on all four checkpoints (14 November). Requests 32, 33, 34 and 40 add states,
  each read whole by the test its fragment names: a settlement's `net` method, its `contested` and `annulled`
  statuses, the audit's `settlement-contested`, the administrators' log's `suspended` and `reinstated`, and request
  40's four currencies to a group's, an expense's and a settlement's `original`, and a rate's. Requests 33, 38 and 39
  restate the settlement whole (its history's statuses, its `fee`, its `original`, each given in some states only),
  and request 40 the notice, whose reminder's least amount was request 18's 2001 hundredths. No fragment of checkpoint
  4 adds a field every state of an earlier resource has: test 30's upgrade case compares eighteen reads through the
  tree at request 29 with the same reads through the tree graded, and would break on one. The forty storms are legal
  against the map of checkpoint 4's session (two relationships more, T22), and request 31's is refused without them.
  The kit's TypeScript, `tally.ts`'s additions and the edited tests 2, 21 and 22 included, raises nothing in the
  witness's checks.
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

## Decided by the operator for checkpoint 3, for the maintainer to review

Where the brief's outline of requests 21 to 30 is terse, the operator decided in its spirit, held to the maintainer's
decisions above (T8 kept, T7's gap documented, settlements in the statement at 29, an unannounced request's storm may
declare a relationship, the fixed reminder threshold, request 30 an upgrade). Each is a line to accept or change.

**The product (the requests).**
1. **Another currency** (request 21) is one of Tally's six, never the group's; the body gives `amount` or
   `original: { currency, amount, rate }`, exactly one (else `400`).
2. **A rate is a decimal string,** greater than 0, at most 6 digits after the point, read back as given; the amount in
   the group's currency is the original times the rate, to the nearest whole number, a half up, and must be 1 to
   100 000 000. A JSON number would make two trees disagree on a half.
3. **The rates service** (request 22) is `GET {RATES_URL}/rates/{from}/{to}?date=` answering `200 { rate }`; the
   offer is read at `GET /v1/groups/{id}/rates/{currency}?date=` (today without a date), `404` when there is none.
4. **The band is 2 % of the rate offered,** both ends taken; a rate left out takes the offer; a service with no rate,
   or down, refuses the expense with or without a rate; **without `RATES_URL` the payer's rate is taken,** so request
   21's behaviour, and its test's servers, are unchanged. Where a rate came from is not in the API.
5. **A recurring expense** (request 23) is monthly, on `startsOn`'s day (1 to 28, `startsOn` within 365 days of today
   either way), in the group's currency, split by one of the three splits (no template), read back as given with
   `next`. Every day that has come is recorded at the next run, so a `startsOn` already passed catches up: that is what
   lets a test see a monthly rule without waiting a month.
6. **A recurring expense whose payer or member has left ends** on its day (gone, `404`), recording nothing: the brief
   says nothing, and recording it would put a former member in a split (request 9).
7. **Categories are a fixed list of eight** (request 24), `other` by default and for every earlier expense; a recurring
   expense carries one.
8. **A budget is the owner's,** monthly by the expense's date in UTC; its notice goes to every current member, the
   payer included, once per group, category and month, when an expense is recorded or edited (setting a budget tells
   nobody); a deletion that brings the month back under, then over again, makes no second one.
9. **A template** (request 25) is `splitBetween` or `splitByShares` (exact amounts depend on an amount: `400`), its
   name free in the group whatever its case, changed by its creator or the owner; an expense gives exactly one of the
   three splits and `template`, and keeps its shares, not the template.
10. **Receipts are kept by an outside store** (request 26, the maintainer's brief for 26: the provider's pattern):
    `POST {RECEIPTS_URL}/files` answers `{ id, url }`, and Tally reads the link back, never the bytes, so no route
    answers a file. A JPEG or a PNG by its first bytes, 1 byte to 2 MB (2 097 152, above Fastify's default limit, so
    that the limit is the tree's decision), attached by who may edit the expense; one per expense, replaced; not an
    edit (the version stays); no removal.
11. **Archiving** (request 27) is the owner's, once every balance is 0 and nothing is `pending` or `refunding`, and is
    for good (no route undoes it); the group reads `archivedAt`, absent until then (test 2 reads a group whole, so no
    field with a value in every state could be added). The eighteen writes the request lists are refused by one name.
12. **The audit** (request 28) has six actions, from request 28 on; `by` is the member the change acts for (a
    provider's payment its payer, a refund its payee, a recurring expense's day its payer); a refund is an entry only
    for a settlement that was counted (a `refunded` that overtakes `succeeded` changes no balance); a balance passed
    only when it is not 0.
13. **A settlement enters a statement while the balances count it** (request 29): from when it is recorded (cash) or
    paid (provider) until it is refunded; dated the UTC day it started counting; described `Settlement in cash` or
    `Settlement through the provider`; `paid` for its payer, `share` for its payee. **What passed to the owner
    (request 20) is not an entry**, as the maintainer's decision names settlements only: the statement's balance is
    the member's balance but for it.
14. **The CSV** is the JSON statement's entries, header `date,kind,id,description,paid,share,balance`, CRLF, quoted
    only where RFC 4180 needs it, integers in hundredths.
15. **Request 30** names `DATABASE_URL` and, as OpenStay's request 40 did, the PostgreSQL 16 server of the environment
    (`127.0.0.1:55432`); unlike OpenStay's, what the file held moves at the first start on an empty database, from a
    file any earlier version kept, and the file is not read again. Without the move, the maintainer's upgrade test
    (decision 6) would have nothing to read.

**The model (the storms):** T12 to T20 and each feature's hot spots, in
[`storms/README.md`](storms/README.md#checkpoint-3-the-session-before-request-21). The ones to read first:
- **T12, no new context, and T18, no integration event for the audit:** T8 stands; every entry is written in its own
  context's transaction and Ledger reads the other two through ports it owns.
- **T16, `BudgetPassed`,** checkpoint 3's one new integration event, on the relationship Ledger already has with
  Notifications, carrying the members to tell.
- **T17, one refusal in three contexts** (`GroupArchived`), a word of the shared kernel: a question for the rule
  register (below).
- **No relationship is added:** every link of checkpoint 3 is a new contract on a pair already declared.

**The tests.**
- **PostgreSQL from request 30 only.** `database()` creates a PostgreSQL database (on `TALLY_POSTGRES`, `127.0.0.1:55432`
  when not set, through `psql`) only once request 30 is reached, and `start` gives the server `DATABASE_URL` beside
  `DATABASE_PATH`: graded up to 29, no test needs a PostgreSQL. Graded whole, every file does.
- **An earlier tree's answers are not held to the API** (`client(port, false)`): request 24 gives every expense a
  `category`, which the tree at request 9 does not answer, so test 10's upgrade case read through that tree failed
  the API composed up to 30. The one line of test 10 that makes that client changes; nothing it asserts does. Test
  30's tree before is read the same way.
- **Superseded case, by request 29:** test 12's last case asserts a statement of expenses only before request 29
  (`reached(29)`), and from 29 the settlement as its last entry; the rest holds under both rules.
- **Test 10's upgrade case, graded from request 30,** records through the tree at request 9 on its SQLite file and reads
  through the PostgreSQL tree: a file an earlier version kept moves too, which request 30 says.
- **The sweep for recurring expenses** is held as request 18's: a server whose job runs once an hour records nothing,
  however often it is read; the same database, then given to a server whose job runs every second, records every day
  that has come at its next run (`bySweep`).
- **Two more outside systems** the tests play, as the provider: `ratesService()` (rates set per day or for any day,
  what Tally asked recorded, `refusing`) and `receiptStore()` (the files kept as sent, the link it answers serving
  them back, `refusing`).
- **Request 30's upgrade test** records through the tree at request 29 (a group, an edited expense, a cash settlement,
  a payment landed, one waiting, a budget, a template, a recurring expense, an archived group), compares eighteen reads
  through the tree graded on the same file and a new PostgreSQL database, lands the waiting payment's webhook (twice,
  under two ids, a late `pending`, the landed one's again), restarts on the same file and database, and reads it from
  a server pointed at another file: one `paid` in the history, one `settlement-paid` in the audit, the balances once.

## Decided by the maintainer before checkpoint 4 (14 November)

The maintainer accepted checkpoint 3 as written, and the operator's recommendation on each question:

1. **`GroupArchived` is one rule, decided by Groups:** one public name; Ledger and Settlements return it by reading
   Groups' state. In the rule register (ADR 46) it is Groups'.
2. **T15: the tests hold the outcome only.** A tree that records a recurring day in one transaction rather than
   through a policy passes; the form is the maintainability review's to read.
3. **Test 10's upgrade case keeps moving a request-9 file** through the tree graded, the PostgreSQL tree included: an
   old database must always be read.
4. **PostgreSQL: one server per tree** in the campaign, each with its own port and data (J5's lesson).
5. **Request 35:** an account's id stays in the audit (an opaque id, not personal data); its name and email are erased
   everywhere. The audit is never changed.
6. **Request 39:** the rate is the rates service's offer at the moment the settlement is decided, kept on it.
7. **Requests 31 and 34:** merging an archived group is a write, refused by `GroupArchived`; a suspension writes
   nothing in a group.
8. **Balances passed to the owner at request 20 stay out of the statement:** they are in the audit only.
9. **A witness that answers later (`202`)** is rehearsed before registration, as decided before checkpoint 3.

## Decided by the operator for checkpoint 4, for the maintainer to review

Where the brief's outline of requests 31 to 40 is terse, the operator decided in its spirit, held to the maintainer's
decisions above (`GroupArchived` decided by Groups, tests that hold outcomes only, test 10's request-9 file, the
account's id kept in the audit, request 39's rate the offer at the decision, merging an archived group refused by
`GroupArchived`, a suspension writing nothing in a group, the passed balances out of the statement). Each is a line to
accept or change.

**The product (the requests).**
1. **A merge** (request 31) is the owner of both groups', `POST /v1/groups/{kept}/merge { from }`, refused while a
   payment of the group merged waits at the provider (as leaving and archiving are); either group archived is
   refused by `GroupArchived` (the maintainer's decision 7).
2. **What a merge moves:** the members (after the group kept's, in the order they had joined, role `member`; a former
   member stays a former member, whose statement is read), the expenses with their receipts, the settlements, the
   recurring expenses, the passed balances and the audit, each keeping its id; **not** the budgets, templates and
   invitations of the group merged (the group kept's hold), nor the notices (they stay as made).
3. **The group merged is 404 at once; the rest moves "within a few seconds"** (T22): a tree that moves through an
   integration event is not refused for being eventual, and the zero sum holds at every moment by construction.
4. **A netting** (request 32) covers the groups both people are current members of, in one currency, not archived;
   its rule is stated (what each can pay in each group, the smaller of the two totals, the caller's settlements first,
   the groups oldest first), as request 11's was, so that two trees net the same; either person asks, without the
   other's consent, since neither's total across the groups changes.
5. **A netting's settlements** are `method` `net`, `paid` at once, counted as a cash settlement is, described
   `Settlement by netting` in the statement, `settlement-paid` by who asked in the audit, never refunded; the netting
   is a resource of its own (`GET /v1/nettings/{id}`), read by the two people.
6. **Administrators** (request 33) are named to the server by `ADMIN_EMAILS`, whatever the case; no API makes one.
   What only they read is `404` to anyone else (request 1's not-found), what only they do is refused.
7. **A contest** is the payee's, once, of a `paid` settlement through the provider; while `contested` it waits (what
   is still owed, leaving, archiving and merging treat it as pending) and is not counted; a webhook changes nothing.
   An administrator decides it `paid` (counted again, an audit entry `settlement-paid` by the administrator) or
   `annulled` (counted nowhere, no longer waiting, owed again).
8. **The administrators' log** is `GET /v1/admin/log`, `{ id, at, by, action, subjectId }`, the oldest first:
   `decided-paid`, `decided-annulled` (request 33), `suspended`, `reinstated` (request 34); a change that changes
   nothing is no entry.
9. **A suspension** (request 34) refuses five things a suspended account starts (an expense, a recurring expense, a
   settlement in cash, a payment through the provider, a netting), by one name, and nothing else; the others may
   still put it in a split and pay it. Its recurring days wait and are caught up at the first run after it is
   reinstated (request 23's catching up), rather than skipped.
10. **A deleted account** (request 35) stays a member of its groups, named `Deleted account`, its balances kept
    (leaving would pass them to the owner, which the request does not ask); its email is free again. It is put in no
    new split, paid nothing through the provider, netted with by nobody; a payment others received from it in cash is
    still recorded. Deletion is refused while the account owns a group with another member (there is no hand-over),
    or a payment of its waits.
11. **"Erased everywhere"** is held on the database: no row of any table holds the name or the email (request 30
    puts every state in PostgreSQL); the notices and the payout account of a deleted account, which hold neither,
    are left unread.
12. **Notice preferences** (request 36) are per person and kind (`expense`, `reminder`, `budget`), not per group, all
    on until turned off; nothing missed is made later, and a reminder not made does not count as made.
13. **Insights** (request 37) are the caller's shares, not what they paid, over the groups they are a member of now,
    by the expense's month in UTC, in the group's currency, lines above 0, every month (no parameter), in a stated
    order.
14. **The provider's fee** (request 38) is in its answer to a payment (`fee`); an answer without one, or with one not
    less than the amount, refuses the payment. The owner decides who bears it, the payee by default (what happened
    before the request); a payment asks the provider for its `amount` as before, and settles that less its payer's part
    (shared: the payer half, rounded down). The no-overpayment rule stays on the amount asked.
15. **Who bears the fee is a resource of its own** (`/v1/groups/{id}/fee-policy`), and a settlement's `fee` is given
    only for a payment asked for from request 38 on: no field is added that every group or settlement would read
    (test 30's upgrade case compares whole reads across trees).
16. **A settlement in another currency** (request 39) gives `original: { currency, amount }` in place of `amount`, in
    cash or through the provider; the rate is the offer for the day it is decided (the maintainer's decision 6), with
    no rate of the payer's and no band; the provider is asked in that currency; its fee is converted at the
    settlement's rate and read in the group's currency.
17. **Request 40's currencies** are `JPY` and `KRW` (no minor unit), `KWD` and `BHD` (thousandths); every limit stated
    as an amount stays 1 to 100 000 000 of the minor unit; a rate is per unit; the reminders' threshold is 20 of the
    group's currency (request 18's "20.00 in its currency", not its 2000); the fee is in the payment currency's minor
    unit. It is an upgrade: nothing stored is converted, and every earlier amount reads the same.

**The model (the storms):** T21 to T28 and each feature's hot spots, in
[`storms/README.md`](storms/README.md#checkpoint-4-the-session-before-request-31). The ones to read first:
- **T21, still no Accounts context:** suspension and deletion are the `Account`'s; administrators are a role given at
  sign-in.
- **T22, two relationships declared at the session:** `GroupsMerged`, Groups' first integration event, to Ledger and
  to Settlements, for request 31.
- **T23, a netting decides over several `SettlementBook`s in one transaction,** all or nothing.
- **T25, "erased everywhere" includes Groups' stored facts** (the outbox, an operation's record).

**The tests.**
- **Superseded cases, by request 40:** tests 2, 21 and 22 refuse `JPY` as a currency Tally does not count in; from
  request 40 they refuse `SEK` in its place (`reached(40)`), and the rest of each case holds under both. The witness
  shows it graded up to 39 and whole (below).
- **Two more lines in `tally.ts`:** the provider says a fee on each payment (`state.fee`, 0 unless a test sets it, so
  every earlier test sees the fee of a tree that ignores it), and `database().holds(text)` counts the rows of every
  PostgreSQL table that hold a text, whatever its case.
- **Administrators** are named per test file (`ADMIN_EMAILS` given to `start`), each signing up as anyone does.
- **A merge's moved state** is read with `eventually` (15 s), the group merged's `404` at once (T22).
- **Request 40's upgrade test** records through the tree at request 39 (an expense in dollars, a cash settlement in
  francs at the rate offered, a payment through the provider with a fee that waits, a budget), compares sixteen reads
  and a CSV statement through the tree graded on the same database, lands the waiting payment, then records in yen:
  an earlier amount read unchanged, a new one in its currency's minor unit.

## Decided by the maintainer before registration (14 November)

The maintainer accepted checkpoint 4 as written, the edits to tests 2, 21 and 22 with it, and the operator's
recommendation on each question:

1. **T22:** a merge crosses the contexts by `GroupsMerged`, over the two relationships request 31's storm declares
   (Groups to Ledger, Groups to Settlements), and completes within a few seconds; the tests read with `eventually`.
2. **T23:** a netting is all or nothing, several settlement books saved in one transaction, although the Lite and Full
   guides do not teach it: a real case whose cost differs with structure.
3. **T25:** "erased everywhere" searches every table, the outbox and the operation records included.
4. **`AccountSuspended` is one rule, decided by Groups,** as `GroupArchived` is.
5. **The split's break-even estimate is run on the storms of 13, 31, 32 and 35 before registration,** and the
   requests registered split are those it puts above the break-even.
6. **Then, in order, while K4 runs:** the tooling released; the Lite and Full starting trees created, with Groups and
   Ledger declared, one PostgreSQL server per tree; a witness that answers later (`202`) rehearsed on them; the kit
   and the arms' profiles hashed and registered, shown to the maintainer before any J6 run.

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

### Checkpoint 3 (14 November)

The same tool, on the same witness, the plan updated: `d859700` before, and `d29b71a` solved, with `previous` for
request 10 (`13ceb79`, as before) and for request 30 (`a46ce6c`). The witness has two commits for checkpoint 3, both
written from the requests and their fragments before the tests: `a46ce6c`, requests 21 to 29 on `node:sqlite` (the
tree before request 30), and `d29b71a` on top of it, request 30: `pg` behind one worker the application waits on, so
that its transactions stay the synchronous ones they were, a write lock per transaction (`pg_advisory_xact_lock`) in
place of SQLite's `BEGIN IMMEDIATE`, and the file at `DATABASE_PATH` moved, in one transaction, into a database that
holds nothing of Tally's. The tests ran against a PostgreSQL 16 the operator started at `127.0.0.1:55432`. **Verdict:
clean, no finding**; [`dry-run.json`](dry-run.json) is this rehearsal's report, the three checkpoints in it.

- **Discrimination:** all thirty files fail on the starting tree.
- **Solvability:** all thirty files pass on the solved tree, at the first run of the dry run. Before it, run file by
  file against the witness, one kit defect was found and fixed in the kit: test 10's upgrade case read the tree at
  request 9 through a client held to the API up to request 30, which request 24's `category` broke
  (`client(port, false)`, above). The witness did not change for a test.
- **Hygiene:** the kit's files raise nothing in the tree's formatter, linter or type checker.
- **Request 30's upgrade test discriminates.** On the tree before it (`a46ce6c`), test 30 fails three of its four
  cases (the state is not in PostgreSQL). On two variants of the solved commit it fails its upgrade case alone:
  `f43cf0b`, whose move leaves behind the payments waiting at the provider, at the first read of the waiting
  settlement after the move (`404`); `3e7d90a`, which moves the file's settlements again at every start, over what
  PostgreSQL holds, after the restart: the payment that landed is pending again, the provider's webhook lands it a
  second time, and its history reads `paid` twice (its audit, two `settlement-paid`). The balances, which count a
  settlement by its status, read right either way: what the test holds is that the payment counts once.
- **Request 29's superseding, graded as the ladder grades it** (`grade.mjs --upto`): on a variant that keeps a
  statement of expenses only (`3483952`, the tree as it would stand after request 28), test 12 passes graded up to 28
  (5 of 5) and test 29 fails (4 of 4); on the tree at request 29 (`a46ce6c`), test 12 fails graded up to 28 (its last
  case, which `reached(29)` keeps from request 29 on) and passes graded whole, beside test 29 (4 of 4). The solved
  commit itself cannot be graded up to 28: from request 30 on it needs `DATABASE_URL`, which `start` gives only once
  request 30 is reached, as the ladder always grades it.
- **A disk that filled.** The first run of the dry run stopped at the solved tree with the machine's disk full: jest's
  transform cache (`/tmp/jest_0`, 13 GB, one entry per file per graded worktree, shared by every session on the
  machine) had filled it, and the PostgreSQL server stopped with it. The operator cleared the cache's entries older
  than ten minutes, restarted the server and ran the dry run again; the verdict above is that run's. A campaign that
  grades thirty files per attempt should give jest a cache directory per run, or clear it between gradings.
- **Not rehearsed, still:** a tree that answers commands later (`202`), where checkpoint 3's policy that records a
  recurring expense's day (T15), its `BudgetPassed` (T16) and the move of an outbox (T20) are what a plain tree cannot
  show.

### Checkpoint 4 (14 November)

The same tool, on the same witness, the plan updated: `d859700` before, and `68ccae6` solved, with `previous` for
request 10 (`13ceb79`), request 30 (`a46ce6c`) and request 40 (`d6c00b1`). The witness has two commits for checkpoint
4, both written from the requests and their fragments before the tests: `d6c00b1`, requests 31 to 39 (the tree before
request 40), and `68ccae6` on top of it, request 40. A merge is one transaction under the database's one write lock
(members inserted, the group merged's rows given the group kept's id, the group merged marked merged); a netting
writes its settlements in one transaction; administrators are read from `ADMIN_EMAILS` at each request; a deleted
account's email, name and password are overwritten and its sessions removed; what PostgreSQL gains after request 30 is
a list of upgrades applied once each on a database any earlier version prepared, so that request 40's upgrade case,
and test 30's, run on a database an earlier tree made. The tests ran against the PostgreSQL 16 at `127.0.0.1:55432`,
started again by the operator after the machine's restart. **Verdict: clean, no finding**; [`dry-run.json`](dry-run.json)
is this rehearsal's report, the four checkpoints in it.

- **Discrimination:** all forty files fail on the starting tree.
- **Solvability:** all forty files pass on the solved tree, at the first run of the dry run, and each of the ten new
  files passed on the witness, run file by file, at its first run: no test had to change for the witness, and the
  witness did not change for a test.
- **Hygiene:** the kit's files, `tally.ts`'s additions and the edited tests 2, 21 and 22 included, raise nothing in the
  tree's formatter, linter or type checker.
- **Request 40's upgrade test discriminates.** On the tree before it (`d6c00b1`), test 40 fails its four cases (no
  group in yen or dinars). On a variant of the solved commit (`62da7a4`), whose first start reads every amount kept
  before it in thousandths — a tenth of what it was, as a tree that moved every currency to one scale without
  converting what it kept would — it fails its upgrade case alone, and passes the three others: an earlier amount
  reinterpreted in the new minor unit is caught, and only there.
- **Request 40's superseding, graded as the ladder grades it** (`grade.mjs --upto`): on the tree at request 39
  (`d6c00b1`), tests 2, 21 and 22 pass graded up to 39 (14 of 14), and so do tests 31 to 39 (28 of 28); on the solved
  tree, tests 2, 21 and 22 fail graded up to 39 (one case each, `JPY` refused, which `reached(40)` keeps until request 40)
  and pass graded whole. So request 2's list is held until request 40, and request 40's from it, by the same files.
- **A flow change that broke grading here.** The first run of the dry run failed every file on the solved tree: a
  grading outside a ladder now gives jest a temporary directory under `<project>.flow/tmp/grade` (the flow's answer to
  checkpoint 3's full disk), and `tsx`, which each test starts the server with, opens a Unix socket there, whose path,
  under the operator's deep scratch directory, came to 114 bytes, over the 107 a socket path may have: no server
  started. The operator graded through a short link to the witness (`w`), which leaves at most 106; the verdict above
  is that run's. A campaign's trees, or the flow, should keep that path short (below).
- **Not rehearsed, still:** a tree that answers commands later (`202`), where checkpoint 4's reactions to
  `GroupsMerged` (T22), the netting's transaction over several books (T23) and the scrubbing of stored facts (T25)
  are what a plain tree cannot show.
