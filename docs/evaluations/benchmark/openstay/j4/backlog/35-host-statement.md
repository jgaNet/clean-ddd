# 35. A host's statement

A host wants to see where the money went.

- **The statement.** Every movement of money of the host's bookings over a range of dates, the oldest first: each payment (`charge`), the provider's fee for it (`fee`), each refund (`refund`), each payout (`payout`), each dispute lost (`dispute`, request 39). Money coming to the host is positive, money leaving negative: a charge is positive, a fee, a refund and a payout are negative.
- **When each happened.** At the time the provider said it happened (the webhook), not when it was asked for. A refund or a payout still `pending`, or `failed`, is not on it.
- **The balance.** The sum of every line up to the end of the range: what OpenStay holds for the host.
- **Who.** A host, for the bookings of the listings they host.

The API works as request 1 says. Ranges run from `from` to the day before `to`, as in request 4.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/hosts/me/statement?from=&to=` | `200 { lines: [ { at, type, bookingId, amount } ], balance }` |
