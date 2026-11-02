# 31. Refunds through the provider

A cancellation said what was refundable (request 8). Now the money goes back.

- **Refunded for real.** When a paid booking is cancelled, OpenStay asks the provider to refund the booking's refundable amount, with the booking's id as the `reference`. The refund reads `owed` until OpenStay has asked, `pending` while the provider works on it, then `refunded` when the provider says `refund.succeeded`.
- **When the provider refuses or fails.** A refund the provider refuses, or that ends with `refund.failed`, is asked again, until it succeeds. It never reads `refunded` before the provider says so.
- **Nothing to send back.** A booking never paid has nothing to refund: its refund stays as request 8 left it. A refundable amount of zero sends nothing.
- **Never more.** What is refunded never exceeds what was paid (and request 32 adds refunds of its own).
- **Two states, still.** Cancelled and refunded stay two different things: a cancelled booking's refund says where the money is.

The API works as request 1 says; the provider is request 26's:

| Provider request or webhook | |
| --- | --- |
| `POST /refunds` `{ payment, amount, reference }` | `201 { id, payment, amount, reference, status: "pending" }`; `400` when more than what is left |
| webhooks `refund.succeeded`, `refund.failed` | `data` is the refund |

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/bookings/{id}` | `refund.status` may be `owed`, `pending` or `refunded`; `payment` gains `refunded`, the amount refunded so far |
