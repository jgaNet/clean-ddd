# J4: what is proposed to the maintainer

J4 is the framing's phase 2 ([j0](../j0.md#the-later-phases)): money through a payment provider the tests play, the storage moved to a server database, and a context split. Features 26 to 50 run on the six trees of J3, from their J3 heads, each from the smallest model up, graded on 1 to n after every attempt. Nothing here is decided until the maintainer says so.

## The features

Payments keep every earlier rule true, so that the 25 earlier hidden tests stay valid regressions. A booking is still confirmed (or requested) at once; it gains a payment that is due, and a booking left unpaid past its deadline lapses.

| # | Feature | What it asks |
| --- | --- | --- |
| 26 | Payout accounts | A host connects an account with the provider. It is enabled by the provider's webhook, never by the host. |
| 27 | Paying a booking | The traveller pays a confirmed booking's total through the provider. The payment is paid when the provider says so, by a webhook. The provider's fee is shown to the cent, and nothing is added to it (invariant 2). |
| 28 | Strong authentication | A payment the provider holds for the traveller's action stays pending until it succeeds or fails. |
| 29 | Webhooks, as they come | Signed, late, twice or out of order: each changes things once, and an unsigned one changes nothing (invariants 4 and 12). |
| 30 | An unpaid booking lapses | Past `PAYMENT_TTL_SECONDS` unpaid, the booking ends by nobody, its nights are free, and its history says so. |
| 31 | Refunds through the provider | A cancelled paid booking is refunded what is refundable: owed, then pending, then refunded. Cancelled and refunded stay distinct (invariant 7). |
| 32 | Partial refunds by the host | Every refund together never exceeds what was paid (invariant 5), under concurrency too. |
| 33 | Payouts | The host is paid the host's lines, less the provider's fee, after the check-in, through the provider. Never more than is due, never twice (invariant 6). |
| 34 | Failed payouts | A failed payout is retried. A disabled account holds it. |
| 35 | A host's statement | Every charge, fee, refund and payout of the host's bookings, and the balance. |
| 36 | Direct payment declared by the host | Shown as "declared by the host", never as verified (invariant 11). |
| 37 | Reconciliation | An administrator compares the provider's transactions with the platform's, by day, and sees every mismatch. |
| 38 | Tourist tax collected | Per city and month, what was collected for each host to remit. |
| 39 | Disputes | A payment the traveller disputes holds its payout, and its booking says so. |
| 40 | **Storage on PostgreSQL** (not announced in advance) | The application keeps its state in PostgreSQL at `DATABASE_URL`. Everything before behaves as before, two servers and crashes included. Moving existing SQLite data is out of scope. |
| 41 | A fee per extra guest | Above a number of guests, a fee per guest and night. |
| 42 | Last-minute prices | A discount for a stay that starts within a number of days. |
| 43 | Promotion codes | A host's codes, with a usage limit that two travellers using the last one at the same moment cannot exceed. |
| 44 | Each night's price on the quote | The quote shows the price of every night, and what changed it. |
| 45 | Prices for many nights at once | A host sets the price of many nights in one request, all or nothing. |
| 46 | Receipts | A receipt per payment and refund, numbered with no gap and no duplicate, under concurrency too. |
| 47 | Weekly payouts | A host may be paid weekly, in one payout for all that is due. |
| 48 | Earnings by month | A host's earnings, fees and refunds, by month. |
| 49 | A traveller's data | Everything the application holds about a traveller, in one export. |
| 50 | Closing an account | Personal data is erased, and the financial records are kept. |

**The split, for the Clean DDD arm.** Pricing has grown inside Booking and Listings: seasons, discounts, the window, extra guests, last-minute prices, codes. The storm of feature 41 is where the session decides whether Pricing becomes a context, and the agent of that feature does the move. Payments is a new context from feature 26, decided in its storm. The simple arm sees none of this.

## What the kit needs

- **A fake provider the tests run.** Accounts, payments with strong authentication, captures, refunds, payouts, a fee per payment, and a list of transactions. It sends signed webhooks, and can delay, duplicate, reorder or refuse them. The requests name `PAYMENT_PROVIDER_URL` and `PAYMENT_WEBHOOK_SECRET`.
- **PostgreSQL for the tests and the agents.** A server on this machine, and a database per test file. The tests give both `DATABASE_PATH` and `DATABASE_URL`, and each tree uses the one it knows. Feature 40's test also checks, with `psql`, that the state is really in PostgreSQL.
- **The rest as in J3:**
  - a fresh agent's review of the tests;
  - a solvability tree written from the requests, which here has to move to PostgreSQL too;
  - storms decided with the maintainer;
  - `dry-run`;
  - every tree graded on 1 to 25 at its J4 start.

## Two things J3 asked for

- **The manager on the host's own routes.** In clean-1 and clean-3, a manager can use `/hosts/me/block` and `/hosts/me/seasonal-prices`, which request 24 refuses, and no test said so.
- **Load is not a defect.** Five of J3's six escalations were the machine's load. The grader can run a failing feature's test again, alone, before the ladder escalates, and count the failure only if it fails again.

## The cost

- J3 cost $47.51 for 15 features: $0.33 per feature in the simple arm, $0.73 in the Clean DDD arm.
- Payments and the migration are wider changes. Three times that per feature is about $225 for 25 features.
