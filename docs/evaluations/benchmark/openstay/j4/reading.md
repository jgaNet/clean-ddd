# OpenStay's J4: what a reader checks in any tree

The hidden tests see what a client sees. This rubric checks what they cannot, in words that apply to the simple arm's trees and the Clean DDD arm's alike. It is [J3's rubric](../j3/reading.md), with the rules requests 26 to 50 add (money, the provider, PostgreSQL, the prices), and three new change probes. It was written while J4 ran, before any final tree was read.

A fresh agent that did not run J4 reads the six final trees. It is not told how any tree was graded. It cannot be blind to the arm, since the structure shows it, so it is told to grade the behaviour and the placement, never the style. For each item it gives a verdict (pass, partial or fail) and a file and line as evidence. Each tree is read against its J4 starting commit, so the reader knows what J4 wrote, and against its J3 starting commit for the items that span both.

## The items

| Id | Item | Pass when |
| --- | --- | --- |
| O1 | Each business rule lives in one place. | Each of these is decided in one function: J3's rules (no night twice, the stay limits, a quote's lines and total, what a cancellation refunds, when a request or a hold expires, the price of a night, the discounts, the booking window, the arrival days, who may act on a listing); and J4's: the provider's fee, what is still refundable, what a payout owes, when an unpaid booking lapses, the price of a night with every adjustment (season, nightly price set in bulk, extra guests, last minute, promotion code) and the order they apply in, a promotion code's limit, the next receipt number, when a weekly payout is due, a host's balance. A rule written twice fails, even if both copies agree: the quote, the nightly breakdown and the statement must ask the same function. |
| O2 | No night twice, under concurrency. | The check that the nights are free and the write that takes them happen in one transaction, one statement, or behind a version check, on PostgreSQL, for every way a night is taken: a booking, a request, a hold, a change of dates, a block, a bulk block. A lapsed booking frees its nights in the same write that ends it. |
| O3 | A refusal is an outcome, not a crash. | Every refusal the requests name reaches the client as a `4xx` or an `ERROR` outcome, produced without throwing through the request. A provider that answers an error, or does not answer, is a refusal or a retry, never a crash. |
| O4 | Time and money are handled as values. | Whether a booking lapses, when a payout is due (after the check-in, weekly), the last-minute window and a webhook's age are decided by functions that take the time as a parameter, or read it from something a test replaces. Amounts are integers in cents; the fee, the discounts, the extra-guest fee, the tourist tax and each refund are integer arithmetic, with the rounding the request names. |
| O5 | What was accepted is kept as accepted. | A booking keeps the lines, total, fees, nightly prices, promotion and policy it was made with. A refund, a payout, a statement, a receipt and the earnings by month are computed from what the booking kept and what the provider confirmed, never recomputed from the listing's prices of today. |
| O6 | The parts change apart. | Accounts, listings, bookings, prices, payments and notices can each change without editing the others' rules. Count the imports from each part into another part's internals. Name the place the provider is called from: one adapter, or calls spread across the rules. |
| O7 | A crash, a second process or a repeated webhook loses or doubles nothing. | A webhook changes things once: the event it carries is recorded in the same transaction as its effect, and a second delivery, a reordered one or one that arrives while the server is down changes nothing it should not. A payout, a refund and a receipt number are never made twice by a crash between the call to the provider and the write that records it. Name each window precisely; mark it suspected when reading alone cannot be sure. |
| O8 | Money never exceeds what it may. | A refund never exceeds what was paid less what was refunded, and a payout never exceeds what is due, under concurrency: the check and the write that records the amount are in one transaction, one statement, or behind a version check. A promotion code's limit holds the same way. The fee shown is the provider's, with nothing added. A direct payment is never shown as verified. Cancelled and refunded stay distinct states. |
| O9 | The basics of security hold. | J3's (salted or slow password hash, no fixed secret, the actor from the authenticated request, the owner checked, a member's permission read at request time); and J4's: a webhook's signature is checked over the raw body, compared in constant time, and refused when older than five minutes; an account is enabled only by the provider; an export holds the traveller's own data and nobody else's; a closed account's personal data is gone from every table, and the financial records it leaves name nobody. |
| O10 | The rules are tested. | Each rule named in O1 and O8 has at least one test of its own, in the tree's own suite. |
| O11 | The change not announced in advance landed in one place. | Request 40 moved the storage to PostgreSQL. Pass when request 40's commits changed the storage (the adapters, the connection, the schema) and nothing that decides a rule; fail when rules, handlers or routes had to change with it. Count the files request 40's commits changed, say how many hold a rule, and whether the transactions that hold O2, O7 and O8 are still transactions on PostgreSQL. |

## The change probes

For each tree, the reader names every file a developer would edit for each request below, without making the change. It counts the files, and the lines it read to find them.

1. **A second provider.** Hosts in one country are paid through another payment provider, with its own API and webhooks. Travellers still pay through the first. Everything a host sees (account, payouts, statement, earnings) works for both.
2. **A cleaning fee.** A host sets a fixed fee per stay. It is on the quote, kept on the booking, paid out to the host with the stay, refunded under the cancellation policy like a night, and shown on the statement, the receipt and the earnings by month.
3. **A minimum payout.** A host may set a minimum: a payout below it waits, and what is due is added to the next one, weekly or not.

The fewer files a change touches, and the fewer lines read to find them, the more local it is. This is a proxy, and the record says so.

## What it is not

- **No style.** It grades no naming and no length for its own sake.
- **Nothing for following the architecture.** The simple arm has none to follow.
- **n/a with a reason.** An item a tree cannot be graded on is marked n/a, with the reason.
- **Not a test result.** A tree that failed a feature is still read, for what it has.
