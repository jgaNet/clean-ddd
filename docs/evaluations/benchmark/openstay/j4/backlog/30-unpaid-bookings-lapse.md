# 30. An unpaid booking lapses

A booking nobody pays should not hold the nights forever.

- **A deadline.** A booking owes its payment within `PAYMENT_TTL_SECONDS` seconds of its confirmation (3600 when that is not set). Its payment shows `dueBy`, an ISO 8601 time.
- **Lapsed.** A booking still not paid past its deadline lapses, with nobody acting: its status is `lapsed`, its nights are free again, and its history (request 9) gains a step `lapsed`, by nobody. It is no longer cancelled, changed or paid.
- **Paid too late.** A payment that succeeds for a booking that has lapsed is refunded in full: OpenStay asks the provider for a refund of the whole payment (`POST /refunds`, request 26), with the booking's id as the `reference`, and asks again if the provider refuses. The booking stays lapsed.
- **When.** Work nobody asks for (lapses, and the payouts and retries of the next requests) runs at least every `JOBS_INTERVAL_SECONDS` seconds (60 when that is not set).

The API works as request 1 says; the provider's refund is request 26's:

| Provider request or webhook | |
| --- | --- |
| `POST /refunds` `{ payment, amount, reference }` | `payment` is the provider's payment id; `201 { id, payment, amount, reference, status: "pending" }`; `400` when the amount exceeds what is left to refund |
| webhooks `refund.succeeded`, `refund.failed` | `data` is the refund |

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/bookings/{id}` | `status` may be `lapsed`; `payment` gains `dueBy` |
| `GET /v1/bookings/{id}/history` | `status` may be `lapsed`, with `by` `null` |
