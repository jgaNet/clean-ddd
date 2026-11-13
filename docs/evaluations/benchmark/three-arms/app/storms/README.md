# Tally's storms: what the sessions decided

The Lite and Full arms get a storm with each request; the simple arm never sees any of this. This file is the
session's preparation for requests 1 to 10: every hot spot they raise, with the operator's decision and what the
alternative costs. The candidate contexts are the [brief's](../brief.md#candidate-contexts-for-the-storms-a-hypothesis)
hypothesis; the decisions below are the operator's, **for the maintainer to accept or change before the kit is
registered**, as the calibration's were ([its storms](../../calibration/storms/README.md)).

The storms are written one per feature, in the inventory's words, as [`conventions/storms/`](../../../../../../conventions/storms)
shows for the notes backlog, each `done: false`.

## How they were validated

`yarn architecture storm validate <file>` reads a storm anywhere, but holds it to the contexts and the map of the
tree it runs in. Run at this repository's root it refuses every Tally storm (`Groups: is not a declared context
(Notes, Security, Notifications, Tracker)`), as it refuses the calibration's. So each storm was validated, as the
calibration's were, from a tree `create` made (13 November, in the operator's scratch space) with the outcome of the
strategic session below applied: the contexts Groups and Ledger declared in the binding and the domain map, empty,
and the two relationships declared `planned`. All ten storms answer *legal against the contract and the map; not in
the code yet*. The Lite and Full arms' starting trees carry the same declarations (S2).

## The strategic session: the contexts and how they relate

| # | Question | Decision | The alternative, and what it costs |
| --- | --- | --- | --- |
| T1 | Where do accounts live? The brief's candidate model names four contexts, none for people. | **In Groups.** An account is who a member is, and the members list shows its name; signing up and signing in are two small use cases beside the groups. | **A fifth context, Accounts** (generic), as the calibration has: one more context to declare, and a port from Groups for the members' names. Worth it if checkpoint 4's suspension (34) and account deletion (35) make people a subject of their own; the maintainer may prefer it now. |
| T2 | Which contexts does checkpoint 1 start with, and when are they declared? | **Groups and Ledger,** declared in the Lite and Full starting trees as the outcome of this session, with the two relationships below declared `planned` (CTX-MAP-DECLARED allows a relationship decided before the code that carries it). Settlements and Notifications are declared at checkpoint 2's session, before request 11, when the first request that needs them is written. | **All four now:** Settlements and Notifications empty through ten requests, and their relationships `planned` that long. Nothing breaks, but a declaration ten requests ahead of its first use is a decision taken without the requests that justify it. |
| T3 | How does Ledger know who may be in a split (the brief's "Groups upstream of Ledger")? | **A port Ledger owns, `GroupMembers`,** answered over Groups' read model, read when Ledger decides: who is a member now, in which order, with which role, and who has ever been one. A member who has just joined can be put in a split at once, which the tests do. So the crossing the brief marks at request 3 happens at request 4: no integration event is published when someone joins. | **Groups publishes `MemberJoined` and `MemberLeft`,** and Ledger keeps a copy of each group's members. Eventual: an expense recorded right after a join could be refused for a member Ledger has not heard of yet, and the hidden tests record one at once. Worth reconsidering at checkpoint 2, when Notifications reacts to Groups' facts anyway. |
| T4 | Where do the balances live, and what keeps the zero sum? | **A read model of Ledger's own facts,** each expense's shares counted against its payer's amount, written in the transaction of the expense. The zero sum holds by construction: every Expense keeps that its shares add up to its amount. No aggregate holds a running balance, so twenty expenses at once on two servers never contend. | **A `GroupLedger` aggregate** holding each member's balance, changed by every expense: one hot row per group, every write a version conflict to retry, for an invariant each expense already keeps. Settlements (checkpoint 2) may want such a boundary for "no overpayment"; that is a decision for request 12. |
| T5 | How does Groups refuse a member who leaves with a balance? | **A port Groups owns, `MemberBalances`,** answered over Ledger's balances read model, read when Groups decides. Ledger is then upstream of Groups for this one question, and Groups upstream of Ledger for T3: two ports, in opposite directions, each in the asking side's words; no domain imports the other. **Known gap:** an expense recorded at the same moment as the leave could leave a former member with a balance. No hidden test sends the two at once, and the brief's invariants do not ask for it. | **One decision across the two contexts** (a saga, or the leave as a Ledger command): out of proportion for checkpoint 1. Request 20 changes leaving (unannounced), and the maintainer may want the gap closed then; this decision must not anticipate it. |

The relationships these decisions give, to declare in the domain map of the Lite and Full starting trees:

| Relationship | Pattern | Mechanism | Contracts (read from the code) |
| --- | --- | --- | --- |
| Groups → Ledger | customer–supplier | owned port | `GroupMembers` (requests 4, 5, 6, 8, 9) |
| Ledger → Groups | customer–supplier | owned port | `MemberBalances` (request 9) |

## The hot spots of each feature

| Feature | Hot spot | Decision |
| --- | --- | --- |
| 1 Accounts | Is signing in a fact? | No: it checks and answers a token, and records nothing. |
| 1 | Where is the name? | On the account, one name in every group. |
| 2 Create a group | Is the owner's membership its own fact? | No: `GroupCreated` carries the owner, who is the first member; `MemberJoined` is for the others. |
| 2 | The currency | A value of the `Group`, from the stated list, fixed: no command changes it. |
| 3 Invite and join | An invitation: part of the group, or its own? | Its own aggregate (`Invitation`): read by people who are not members, used any number of times; accepting it changes the `Group`, which keeps each account a member once. |
| 3 | The link's safety | The invitation's id is generated by the domain, long and random; it is the proof. |
| 4 Record an expense | One aggregate per expense? | Yes, `Expense`, created with a `Split` value; the balances are not an aggregate (T4). |
| 4 | The shares | Computed by the `Split` when the expense is recorded (rounded down, the remainder whole to the payer), and kept as decided; never computed again at a read. |
| 5 Balances | Order and zero | Groups' join order, through `GroupMembers`; a member with nothing is 0. |
| 6 Edit and delete | The version an edit gives | The `Expense` refuses an edit from a version it is no longer at, by its own rule's name; its optimistic check (CONC-OPTIMISTIC) makes the second of two writers re-read and meet that rule. |
| 6 | The owner's right | From the role `GroupMembers` answers. |
| 6 | Deleting | `ExpenseDeleted`; the expense is gone from every read, and from the balances in the same transaction. |
| 7 Unequal splits | One command per kind? | No: `RecordExpense` and `EditExpense` take a `Split` of one of three kinds. "Exactly one of the three" is the body's shape (400); adding up and whole shares are the `Split`'s. |
| 8 History and statement | Who answers a statement under a members route? | Ledger; the route is only where the API puts it. "Recorded" is when the expense was first recorded, never changed by an edit. |
| 9 Leave a group | The balance | Through `MemberBalances` (T5); the owner never leaves. |
| 9 | A former member's expenses | The `Expense` asks `GroupMembers` whether its payer and each member of its split are still members, and refuses to change otherwise. |
| 10 The remainder (unannounced) | Where the change lands | In the `Split` alone; no sticky changes. Earlier expenses keep their shares because the shares were kept as decided (feature 4), not because anything anticipated this request. |

## What the session did

1. T1 to T5 and the features' hot spots: proposed by the operator on 13 November, for the maintainer.
2. The storms validated against a tree `create` made, with Groups and Ledger declared and the two relationships
   `planned` (above).
3. Before registration: the maintainer's decisions, then the Lite and Full starting trees committed with the same
   declarations, and the storms validated again there.

## Checkpoint 2: the session before request 11

The session of checkpoint 2 (requests 11 to 20), held before request 11 as the maintainer decided (T2). As for
checkpoint 1, every decision below is the operator's, **for the maintainer to accept or change before the kit is
registered**.

### How they were validated

As checkpoint 1's: from a tree `create` made (13 November, in the operator's scratch space), with the contexts
Groups, Ledger, Settlements and Notifications declared in the binding and the domain map, and the relationships
below declared `planned`. All twenty storms answer *legal against the contract and the map; not in the code yet*.
With the map of the session alone (without T10's relationship), the nineteen storms of requests 1 to 19 are legal and
request 20's is refused, as it should be: *link Settlements → Groups: a relationship the context map does not
declare*.

### The strategic session

| # | Question | Decision | The alternative, and what it costs |
| --- | --- | --- | --- |
| T6 | Which contexts does checkpoint 2 add? | **Settlements** (core: settling up, the provider, payout accounts) **and Notifications** (generic: notices and reminders), declared at this session, before request 11, empty, as the maintainer decided (T2). Notifications is a context from its first request (17), not a module of Ledger. | **Notices in Ledger, reminders in Settlements:** no fourth context, but two contexts that each learn to tell people, and a fifth reason for Ledger to change. The brief's fourth context is kept. |
| T7 | What keeps "no overpayment" when two settlements are decided at once? | **A `SettlementBook` per group,** the aggregate every settlement of the group is decided in, cash and provider alike, with their statuses. It reads the balances through `GroupBalances` (Ledger's, which count the paid settlements through T8's port) and takes off the payments it holds pending; its optimistic check (CONC-OPTIMISTIC) makes the second of two writers re-read the balances, the first one's settlement in them, and meet the rule. Only settlements and webhooks contend for it, never expenses. | **One `Settlement` aggregate per settlement** and the rule in a domain service: two settlements at once never conflict, and both are kept (the hidden test sends them). **A `GroupLedger` in Ledger** holding expenses and settlements: every expense a write to one hot row, which T4 refused for checkpoint 1. **Known gap:** an expense deleted at the very moment a settlement is decided can leave the settlement above what is then owed; no test sends the two at once, and the brief's invariant is "at the moment it is decided". |
| T8 | How does a landed payment reach Ledger's balances? | **Ledger reads it:** a port Ledger owns, `SettledAmounts`, answered over Settlements' read model, read when Ledger reads a balance. A balance never misses a settlement that is paid, so the decisions that read a balance (a settlement, leaving, the suggestions) never decide on a copy that lags. The brief's "it tells Ledger a payment landed" becomes "Ledger asks". | **An integration event `SettlementPaid`** and a copy of the settled amounts in Ledger: Tally's most natural pivot, but the balances become eventual. A settlement decided right after another, or a leave (request 20) decided right after a payment landed, would read a balance that has not heard of it, and the zero sum would hold only eventually. Worth it if Ledger later reacts to a payment (an audit, request 28). |
| T9 | Where do notices come from? | **An expense's notice from a fact Ledger publishes** (`ExpenseRecorded`, Tally's first integration event), which Notifications turns into one notice per member, through the outbox (EVENT-AFTER-COMMIT); **a reminder from Notifications' own background job,** which asks Settlements what each member still owes (`OutstandingDebts`, an owned port) and keeps a `DebtWatch` per member and group. | **Reminders from facts** (every expense and settlement published to Notifications, which keeps its own balances): a second copy of the balances to keep exact. **Notifications reading Ledger's expenses** through a port, at a sweep: notices would wait for the job, and the request says "soon". |
| T10 | Request 20, unannounced: what does the session declare of it? | **Nothing.** The session declares what requests 11 to 19 need; request 20's storm brings the one relationship it adds, Settlements → Groups (`WaitingPayments`: a member does not leave while a payment of theirs waits), and the arm declares it with that storm. Declared at the session, it would be in the Lite and Full starting trees of checkpoint 2, and would announce request 20. T5's gap is closed in request 20's storm: the leave reads the balance in its own write transaction, the expense reads the membership in its own, and the one database serialises them. | **A saga** between Groups and Ledger, or **leaving as a Ledger command:** out of proportion for one rule, and the request says "in one step". |
| T11 | Where is the payment provider in the model? | **Behind a port Settlements owns** (`PaymentProvider`: a payment link, a refund, whether it knows a payout account), its answers plain values the `SettlementBook` and the `PayoutAccount` take or refuse (DOMAIN-NON-DETERMINISM). Its webhook is a command anyone may send (`ReceivePaymentWebhook`), its signature the proof, checked at the transport before anything is decided (API-CALLER-AT-TRANSPORT). | **A Payments context** of its own, generic, downstream of Settlements: a fifth context for one port and one webhook. |

The relationships, to declare in the domain map of the Lite and Full starting trees of checkpoint 2, beside
checkpoint 1's two (`planned` until the code carries them):

| Relationship | Pattern | Mechanism | Contracts (read from the code) | Declared |
| --- | --- | --- | --- | --- |
| Ledger → Settlements | customer–supplier | owned port | `GroupBalances` (requests 11, 12, 13) | at the session |
| Groups → Settlements | customer–supplier | owned port | `SettlementMembers` (requests 11, 12, 13, 15, 19) | at the session |
| Settlements → Ledger | customer–supplier | owned port | `SettledAmounts` (requests 12, 13, 15) | at the session |
| Ledger → Notifications | published language, anti-corruption layer | integration event | `ExpenseRecorded` (request 17) | at the session |
| Settlements → Notifications | customer–supplier | owned port | `OutstandingDebts` (request 18) | at the session |
| Settlements → Groups | customer–supplier | owned port | `WaitingPayments` (request 20) | by request 20's storm |

Request 20 also uses checkpoint 1's two: `MemberBalances` (Ledger → Groups) for what passes, and `GroupMembers`
(Groups → Ledger), through which Ledger reads what passed to the owner.

### The hot spots of each feature

| Feature | Hot spot | Decision |
| --- | --- | --- |
| 11 Suggested settlements | Which context answers it? | Settlements, from `GroupBalances` and `SettlementMembers`; a query, nothing kept. |
| 11 | "The fewest transfers"? | The stated greedy algorithm: the exact minimum is a hard problem two trees would answer differently. |
| 12 Settle in cash | No overpayment at once | The `SettlementBook` (T7). |
| 12 | Who records a cash settlement? | Its payee, who received the money. |
| 12 | The statement | Stays the expenses' (request 8); the request says so. |
| 13 Through the provider | The provider | A port (T11); asked after the rules are checked, the book deciding again with the link in hand. |
| 13 | A pending payment | Counts as paid for what is still owed; the balances count it once paid (T8). |
| 14 Webhooks | What counts a payment once? | Its status, forward only; no table of webhook ids. Two servers: the book's optimistic check. |
| 15 Refunds | A refund | A status of the same settlement (refunding, refunded), counted until the provider says refunded. |
| 16 Payout accounts | Where? | A `PayoutAccount` per person in Settlements; "required" decided by the book before the provider is asked. |
| 17 Notices | How Notifications learns of an expense | `ExpenseRecorded`, an integration event (T9); edits and deletions are not told. |
| 18 Reminders | Who notices a lasting debt? | Notifications' background job and its `DebtWatch` (T9); a storm has no sticky for a timer, so the sweep is named in its hot spot, its facts in Notifications' events. |
| 19 Settlement history | Where does a history come from? | From the book's own facts, one line each; a webhook that records nothing adds nothing. |
| 20 Leave with a balance (unannounced) | Who decides what passes? | The `Group`, reading `MemberBalances` in the leave's transaction (`BalancePassed`); Ledger counts it through `GroupMembers` (T10). |
| 20 | An expense at the same moment | Serialised on the one database: counted in what passes, or refused (T5's gap, closed). |
| 20 | Not an upgrade | Every member who left before it left at 0. |
