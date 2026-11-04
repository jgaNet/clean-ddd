# 66. Suspending an account

A host who cheats travellers, or a traveller who abuses hosts, must be stopped at once, and the travellers who were going to stay with that host must not be left with a booking nobody will honour.

- **Who.** An administrator (an account whose email is in `ADMIN_EMAILS`, request 37) suspends an account, with a reason of 1 to 500 characters, and reinstates it, with a note of 1 to 500 characters. Anyone else gets `403`. An administrator cannot suspend their own account. Suspending a suspended account, or reinstating one that is not suspended, is refused. A closed account (request 50) reads `closed`, and is neither suspended nor reinstated.
- **It can no longer sign in.** Signing in is refused with `401`, the same answer as a wrong password (request 1). Every token it was given before is refused with `401`, on every server.
- **Its listings leave search.** Every listing it hosts that is `published` is no longer found by any search, and cannot be quoted, held or booked. Its status stays `published`, and its page still reads by its id. A request waiting for its decision (request 7) is left to expire.
- **Its stays to come, as a host, are cancelled.** Every booking of a listing it hosts that is `confirmed` and whose check-in date is after today is cancelled by the platform, as a host's cancellation is (request 8):
  - it reads `cancelled`, with `cancellation: { by: "platform", at, refundable }`, and `refundable` is the whole total;
  - its history (request 9) gains a step `cancelled`, by `null`;
  - its nights are free again;
  - paid through the provider (request 27), it is refunded through the provider, as request 31 says: `owed`, `pending`, then `refunded` when the provider says `refund.succeeded`, asked again when it fails, never more than what is left of what was paid (request 32). Declared paid directly (request 36), or not paid, nothing is sent to the provider;
  - its traveller gets a notice (below).
- **The notice.** When `NOTIFY_URL` is set, each booking cancelled this way sends `POST {NOTIFY_URL}` with `{ id, kind: "booking-cancelled", accountId, bookingId }`, `accountId` the traveller's. As in request 10, a notice not accepted with a `2xx` within two seconds is sent again with the same body (the first retry within a second, each later one at most five seconds after the previous attempt ended) until it is accepted, and never again once accepted.
- **Once, whatever happens.** With two servers on one database, or a server killed at any moment and started again, each booking is cancelled once, refunded once, and has one notice, under one id, accepted in the end.
- **What stays.** Its bookings as a traveller, its reviews and its messages are untouched. What is due to it as a host for stays already begun is paid out as before (request 33).
- **Reinstated,** it signs in again, with a new token: the tokens it had before stay refused. Its published listings are found, quoted and booked again. Nothing cancelled comes back.
- **Today** is as request 57 says: the machine's date plus `CLOCK_OFFSET_DAYS` days, in UTC.

The API works as request 1 says; the provider's refunds are request 26's.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/admin/accounts/{id}/suspend` `{ reason }` | |
| `POST /v1/admin/accounts/{id}/reinstate` `{ note }` | |
| `GET /v1/admin/accounts/{id}` | `200 { id, email, roles, status }`, `status` one of `active`, `suspended`, `closed`; `email` is `null` for a closed account; `403` for anyone but an administrator |
| `GET /v1/bookings/{id}` | `cancellation.by` may now be `platform` |
