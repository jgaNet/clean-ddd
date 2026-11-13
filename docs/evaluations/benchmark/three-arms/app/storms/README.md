# Tally's storms, checkpoint 1: what the session decided

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
