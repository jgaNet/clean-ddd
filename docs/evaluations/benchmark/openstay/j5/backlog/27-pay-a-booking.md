# 27. Paying a booking

A confirmed booking is now paid, through the provider.

- **A payment due.** A booking confirmed at once, or a request once its host accepts it, owes its total. It shows a payment `due`, for the booking's `total`, until it is paid. A request waiting for its host owes nothing yet.
- **Paying.** The booking's traveller pays: OpenStay asks the provider for a payment of the booking's total, with the booking's id as the `reference`, and gives the traveller the provider's payment id and its `payUrl`, as the provider gave them. The traveller pays there, at the provider. Asking to pay again while a payment is under way gives the same payment, never a second one.
- **Paid.** The booking's payment is `paid` when the provider says so, by `payment.succeeded`, and not before; the booking's own `status` does not change. A `payment.failed` makes the payment `due` again: the traveller may pay again, with a new payment.
- **The fee, as it is.** Once paid, the booking shows the provider's `fee` for that payment, to the cent, as the provider gave it. OpenStay adds nothing to it and takes nothing for itself. The fee is the host's cost (request 33); the traveller pays the total, no more.
- **Its dates.** A booking whose payment is under way or paid can no longer change its dates (request 19): that is refused.
- **Who.** Only the booking's traveller pays. The traveller, the host and anyone who may read the booking read its payment.

The API works as request 1 says; the provider and its webhooks are those of request 26:

| Provider request | Answer |
| --- | --- |
| `POST /payments` `{ amount, reference }` | `201 { id, amount, reference, status: "requires_payment", payUrl }` |
| webhook `payment.succeeded` | `data` is the payment, with the provider's `fee` |
| webhook `payment.failed` | `data` is the payment, and a `reason` |

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/pay` | `{ paymentId, payUrl }`, the provider's: at once, or as the operation's result (request 1) |
| `GET /v1/bookings/{id}` | gains `payment: { status, amount, fee }`, `status` one of `due`, `pending` (a payment under way), `paid`; `fee` is 0 until paid; `payment` is `null` for a request still waiting |
