# 32. Partial refunds by the host

A host may give money back of their own accord: a broken shower, a day lost to a storm.

- **A refund by the host.** The listing's host (or a manager of its organisation, request 24) refunds a paid booking any amount of at least 1 cent, with a reason of 1 to 200 characters, whatever the booking's status.
- **Never more than paid.** All the refunds of a booking together (the cancellation's and the host's) never exceed what was paid. A refund that would is refused, and so is the second of two made at the same moment when both together would.
- **Through the provider.** Each one is a refund at the provider, as request 31 says: `pending`, then `refunded`, asked again if it fails.
- **Who sees them.** The traveller, the host and anyone who may read the booking list its refunds, oldest first.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/refunds` `{ amount, reason }` | creates the refund, `{ id }` |
| `GET /v1/bookings/{id}/refunds` | `200 [ { id, amount, reason, by, status, at } ]`, oldest first, the cancellation's refund included, with `by` `null` for it |
