# 33. Payouts

The host is paid what the stay earned them.

- **What is due.** For each paid booking, the host is owed what was paid (the booking's total), less the provider's fee for its payment, less what was refunded of it. Never more. The tourist tax goes to the host with the rest: the host remits it to the city (request 38); OpenStay's own line is zero.
- **When.** Once the booking's check-in date has begun (in UTC), and the booking is not cancelled or lapsed.
- **Through the provider.** OpenStay pays the host through a payout to the host's enabled account (request 26), with the booking's id as the `reference`, once per booking: never twice, even across a crash. A host with no enabled account is paid once they have one.
- **Paid.** A payout reads `pending`, then `paid` when the provider says `payout.paid`.
- **Who.** A host lists their own payouts, the most recent first.

The API works as request 1 says; the work runs as request 30 says, every `JOBS_INTERVAL_SECONDS` at least.

| Provider request or webhook | |
| --- | --- |
| `POST /payouts` `{ account, amount, reference }` | `201 { id, account, amount, reference, status: "pending" }`; `400` when the account is not enabled |
| webhooks `payout.paid`, `payout.failed` | `data` is the payout |

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/hosts/me/payouts` | `200 [ { id, bookingIds, amount, status, at } ]`, `status` `pending` or `paid`, the most recent first |
