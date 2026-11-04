# 89. Payouts per currency

A host with a flat in Paris and one in London is paid in euros for the first and in pounds for the second, and wants to see each currency's money on its own.

- **The currencies,** as request 87 says: a booking, its payment, its fee and its refunds are in its listing's currency, `EUR`, `GBP`, `CHF` or `JPY`, each amount an integer in that currency's minor unit (yen for `JPY`).
- **One currency per payout.** A host is paid each currency apart. A payout is in one currency, its `currency`, and never mixes two. What is due for a booking is as request 33 says: what was paid, less the provider's fee for it, less what was refunded of it, once its check-in date has begun.
- **Per booking** (`daily`, request 47's default): one payout per booking, in the booking's currency, with the booking's id as its `reference`, as before.
- **Weekly** (request 47): on the host's weekday, in UTC, one payout for each currency in which something is due, each listing the bookings it pays (`bookingIds`). A payout of several bookings has a `reference` of OpenStay's own, one per payout; a payout of one booking keeps the booking's id. A currency with nothing due gets no payout.
- **Failures and holds.** A failed payout (request 34) is owed again in its currency, and paid by a new payout in it. While the host's account is `disabled`, nothing is paid in any currency. A disputed booking's payout waits (request 39), in its currency, without holding the others.
- **Once.** Each booking is paid out once, never twice: across a crash, on two servers on one database, and when the host changes their schedule.
- **The statement per currency.** The host's statement (request 35) and earnings by month (request 48) take a `currency`, `EUR` when not given, and count only the movements in it: the statement's lines (`charge`, `fee`, `refund`, `payout`, `dispute`, by when the provider said each happened) and its `balance`, what OpenStay holds for the host in that currency; the earnings' `charged`, `fees`, `refunded` and `paidOut`. Each answer says its `currency`. A currency that is not one of the four is refused with `400`. Without `currency`, both count the euros, as before.

The API works as request 1 says; the work runs every `JOBS_INTERVAL_SECONDS` at least (request 30), and the provider is request 26's, with the currency of request 87:

| Provider request or webhook | |
| --- | --- |
| `POST /payouts` `{ account, amount, currency, reference }` | `201 { id, account, amount, currency, reference, status: "pending" }`; `400` when the account is not enabled |
| webhooks `payout.paid`, `payout.failed` | `data` is the payout, with its `currency` |

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/hosts/me/payouts` | `200 [ { id, bookingIds, amount, currency, status, at } ]`, the most recent first |
| `GET /v1/hosts/me/statement?from=&to=&currency=` | `200 { currency, lines: [ { at, type, bookingId, amount } ], balance }` |
| `GET /v1/hosts/me/earnings?year=YYYY&currency=` | `200 [ { month, currency, charged, fees, refunded, paidOut } ]` |
