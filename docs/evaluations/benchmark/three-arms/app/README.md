# J6's application kit: Tally, checkpoint 1 (requests 1 to 10)

The application of the [three-arms protocol](../README.md): **Tally**, a group of people sharing expenses, written
from the [brief](brief.md) the maintainer approved on 13 November. It is the campaign's counted kit, in four
checkpoints of ten requests; this is **checkpoint 1 of 4**, groups and the ledger. The calibration (OpenStay 1 to 10,
run first and not counted) is a separate kit, [`../calibration`](../calibration/README.md).

No arm was tuned on it: its domain is none of the three arms' guides' examples, and its requests were written after
the arms' rules. Every arm's agents receive one request at a time with its API fragment (`api/<n>-<id>.yaml`); the
Lite and Full arms also the feature's storm. The hidden tests, the brief and this README are never given to an agent.

## What is in it

| Path | What it is |
| --- | --- |
| [`brief.md`](brief.md) | The approved brief: the product, the actors, the candidate contexts, the invariants, the outline of the forty requests. |
| [`backlog/`](backlog) | The ten requests of checkpoint 1 and `backlog.yaml`. Request 1 fixes how the API works, as the calibration's request 1 does; request 10 is the change not announced in advance (below). |
| [`api/`](api) | One fragment per request with an API table (1 to 9; request 10 changes no route): its resources, the routes that answer them by status, and, from request 1, what any route may answer (`202 { operationId }`, a `4xx`; never a `5xx`). |
| [`conventions.yaml`](conventions.yaml) | Every convention a later request relies on (36), with the request that sets it and the test that holds it there. |
| [`acceptance/`](acceptance) | The hidden tests, one file per request (50 tests), and their client [`tally.ts`](acceptance/tally.ts): the calibration's harness (`start`, `stop`, `kill`, `database`, `eventually`, `bySweep`, `client`, `hidden`, `holdToApi`) with Tally's resources (`person`, `group`, `invite`, `join`, `groupOf`, `expense`, `shares`, `balances`) and two additions, `reached` and `keepsTheSplit` (below). |
| [`storms/`](storms) | One storm per request, in the inventory's words, and the session's [hot spots](storms/README.md), decided by the operator for the maintainer. |
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

**The change not announced in advance (request 10).** Requests 1 to 9 say the remainder goes to the payer and
nothing else: no word of an order that matters for the remainder, no rule "for now". Request 4 says the shares are
read in the order the split was given, because a client shows them that way; that is what lets request 10 name
"the member listed first" without changing the API.

## How it is checked

- **`node .claude/flow/kit-check.mjs docs/evaluations/benchmark/three-arms/app`: clean.** Every request with an API
  table has its fragment and every route of its table composes; every convention has its `born` and its `it`; the
  operation composed is the contract's (`error: { type, message }`), so no difference is printed. No fragment adds a
  state to an enum in checkpoint 1 (Tally's states come with settlements and archiving); each resource is read whole,
  through the client, by the tests of the request that defines it.
- **The storms:** each is legal against the contract and a map that declares Groups and Ledger
  ([how](storms/README.md#how-they-were-validated)).
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
  before request 10 was written. A hidden test graded on one commit has no such expenses: its database is made by
  the tree under test. Test 10 holds what it can (shares kept across reads, other expenses and a restart; an edited
  expense split by the new rule), and a tree that computes the shares at every read, from the rule in force, passes
  it. The rest is the maintainer's to decide (below).
- **Durations.** A test that requires an order by time sleeps 1.1 s between the two events it orders, as the
  calibration's do, for a tree that keeps times to the second.

## Before checkpoint 2: for the maintainer to decide

1. **The not-recomputed half of request 10.** Either accept it as unheld by a hidden test (read by the
   maintainability review, and counted in the cost of change), or add an upgrade step to the flow: at request 10,
   `grade.mjs` starts the tree's commit of request 9 on a database, records expenses through the kit's client, then
   starts the request-10 commit on the same file and runs a test against it. That is a change to `grade.mjs` (and
   the ladder), not to this kit; the operator has not made it. Requests 20, 30 and 40 raise the same question
   (leaving with a balance, storage, precision "for every earlier amount read"), so it is better decided once now.
2. **T1: accounts** stay in Groups, or become a fifth context before checkpoint 4 (suspension, deletion).
3. **T2: declare Settlements and Notifications** at checkpoint 2's session, before request 11.
4. **T5's gap:** whether request 20 closes it, and whether a hidden test sends an expense and a leave at once.
5. **The [X] mark of request 3,** moved to request 4 by T3: whether the protocol counts cross-context requests by
   the brief's marks or by the storms' links.
6. **`reached`,** the superseded cases' mechanism: accept it, or list the superseded cases outside the tests as J5
   did and leave them failing from request 10 on.

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
