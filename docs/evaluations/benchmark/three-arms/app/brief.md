# Tally: the brief of J6's application (draft, for the maintainer's review)

*Drafted by the operator on 13 November, for the maintainer's review before any request is written. Like OpenStay's
brief, it is never given to an agent of any arm: the arms receive the requests, one at a time, and the API fragments of
the requests they have reached (RFC 0005, D3). The candidate contexts below are a hypothesis for the Lite and Full arms'
storms; the plain arm never reads them.*

## The product

Tally lets a group of people share expenses: housemates, a trip, a club. Someone pays; the expense is split between
the members it concerns; Tally keeps what each member owes or is owed. Members settle up with each other, in cash or
through a payment provider. Tally takes no commission.

**Why this domain:**
- **It is unrelated to OpenStay,** so no arm's rules or kit were drawn from it.
- **It has a money invariant that concurrent writers can break:** a group's balances always sum to zero, and a
  settlement never pays more than is owed.
- **It crosses contexts naturally:** a membership decides who can be in a split, a settlement changes a balance, a
  member who leaves takes or leaves a debt.

## Actors

- **A member:** a signed-in person, in one or more groups.
- **A group's owner:** the member who created it, with a few rights more.
- **An administrator:** the platform's, few rights, always logged.
- **The payment provider:** an outside system that the hidden tests play, with webhooks that may come late, twice or out
  of order.
- **Time:** sweeps that act at the next run, never at a read.

## Candidate contexts (for the storms; a hypothesis)

| Context | Holds | Relationships |
| --- | --- | --- |
| Groups | groups, members, invitations, roles | upstream of Ledger (who may be in a split) |
| Ledger | expenses, splits, balances, statements | downstream of Groups; upstream of Settlements (what is owed) |
| Settlements | settlements, payments through the provider, refunds | downstream of Ledger; it tells Ledger a payment landed |
| Notifications | notices and reminders | downstream of the three, from checkpoint 2 |

## The invariants (each held by a hidden test where it is born)

- **Zero sum:** a group's balances always sum to zero, after any sequence of expenses, edits, deletions and settlements.
  That holds with two servers on one database, and with the same changes sent at once.
- **The split adds up:** an expense's shares add up to its amount, exactly. The rounding remainder goes to a stated
  member, never lost.
- **No overpayment:** a settlement never pays more than the payer owes the payee at the moment it is decided.
- **One payment, one effect:** a provider's webhook received twice, late or out of order changes a balance once.
- **Who may act:** only a member of a group sees it; only the payer or the owner edits an expense.

## The conventions, fixed in request 1 (the same as the calibration's)

Request 1 fixes how the API works:
- every route under `/v1`;
- a signed-in request carries a bearer token;
- a change answered at once (`2xx` or `4xx`), or later as `202 { operationId }` with the outcome at
  `GET /v1/operations/{id}`;
- an operation's `error` is `{ type, message }` (ADR 41);
- a `5xx` is never an answer the application chooses;
- ids are strings, dates `YYYY-MM-DD`, times ISO 8601 in UTC;
- amounts are integers in the minor unit of the group's currency.

The conventions every later request relies on are registered with their test in request 1 (`conventions.yaml`).

## The forty requests, in four checkpoints (an outline, each to be written in full)

Marks:
- **[U]** is a change not announced in advance: one per checkpoint (RFC 0005, D5). The requests before it say nothing
  of it.
- **[X]** crosses contexts.
- **[S]** is meant to be above the split's break-even (next campaign, correction 14). These are registered split and
  not split.

### Checkpoint 1 — groups and the ledger (1–10)

1. Accounts, and how the API works.
2. Create a group, with its currency, fixed at creation; list my groups.
3. Invite by a link, join, list the members. [X]
4. Record an expense split equally between chosen members, the remainder to the payer. [X]
5. A group's balances, and the zero sum.
6. Edit and delete an expense, by its payer or the owner. Two edits sent at once: one wins, the other is refused by
   its rule's name.
7. Unequal splits, by exact amounts or by shares, which must add up.
8. A group's expense history and a member's statement, in a stated order.
9. Leave a group, refused while one's balance is not zero. [X]
10. **[U]** From now on, the rounding remainder goes to the member listed first in the split, not to the payer.
    Earlier expenses are not recomputed.

### Checkpoint 2 — settling up (11–20)

11. Suggested settlements: the fewest transfers that bring every balance to zero, by a stated algorithm.
12. Record a settlement in cash between two members; it never exceeds what is owed. [X]
13. Pay a settlement through the provider: a payment link, and the provider's webhook confirms it, which changes the
    balances. [X] [S]
14. Webhooks late, twice or out of order change a balance once. [X]
15. Refund a settlement through the provider; the balances go back. [X]
16. A member's payout account at the provider is required to be paid through it; refused otherwise, by name.
17. Notices: a member is told when an expense concerns them. [X]
18. Reminders: at the next sweep, a member who has owed more than a threshold for a week is reminded, once a week.
19. Settlement history per group, with each settlement's state.
20. **[U]** A member may now leave with a balance: what they owe or are owed passes to the group's owner, in one step
    that keeps the zero sum. [X]

### Checkpoint 3 — currencies and recurring expenses (21–30)

21. An expense in another currency, at a rate the payer states. The rate and both amounts are kept. [X]
22. Rates offered by a rates service (an outside system, played by the tests); the payer may accept or override within
    a stated band.
23. Recurring expenses (rent each month), created at the next sweep after their day, never at a read.
24. Budgets per category, with a notice when a month's spending passes one. [X]
25. Split templates per group.
26. A receipt attached to an expense: an image, its size and type limited.
27. Archive a group: it is read only, and every write is refused by name.
28. An audit of money changes per group: who changed what, when.
29. A statement exported as CSV, in a stated column order.
30. **[U]** Storage moves from SQLite to PostgreSQL, said in one sentence, as OpenStay's request 40 did.

### Checkpoint 4 — across groups and people (31–40)

31. Merge two groups of the same currency: members, expenses and balances, the zero sum kept. [X] [S]
32. Net debts between the same two people across all their groups, on request, as settlements. [X] [S]
33. A payee contests a provider settlement. Its effect on the balances is held until an administrator decides. [X]
34. An administrator suspends a member. No new expense or settlement from them, in any group. [X]
35. A member deletes their account. They are anonymised in every ledger, and the balances are kept. [X] [S]
36. Notice preferences per member and per kind of notice.
37. Spending insights across one's groups, by month and category.
38. Who bears the provider's fee on a settlement: the payer, the payee, or shared, as the group decides.
39. A settlement across currencies: its rate is fixed when it is decided.
40. **[U]** Currencies with no minor unit or with three decimals are allowed. Amounts are in each currency's own minor
    unit, from now on and for every earlier amount read.

## What the maintainer is asked to decide on this draft

- **The domain and the four checkpoints,** or changes to them.
- **The four unannounced changes:**
  - 10, a rounding rule;
  - 20, leaving with a balance;
  - 30, storage;
  - 40, currency precision.

  Each must be a change whose cost differs with structure. Is the storage change worth repeating from OpenStay, or
  should it be another business change?
- **The [S] requests (13, 31, 32, 35):** large enough to be above the break-even. The estimate is to be run on their
  storms before registration.
- **Whether Notifications is a fourth context from checkpoint 2,** or stays in the others.

## Then

- **Requests 1–10 first.** The operator writes them in full, with their hidden tests, their API fragments and their
  conventions, held to the kit standard (`kit-check.mjs`).
- **The maintainer reviews each checkpoint before the next is written.**
- **When the four checkpoints are written and reviewed,** the kit is rehearsed with `dry-run.mjs`, hashed and registered
  with the protocol.
