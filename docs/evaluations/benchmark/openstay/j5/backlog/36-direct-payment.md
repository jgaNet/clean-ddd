# 36. Direct payment declared by the host

Some hosts are paid in cash, or by a bank transfer they arrange themselves.

- **Declared.** The host of a booking whose payment is `due` may declare it paid directly. Its payment then reads `declared`, with `verified: false`.
- **Never verified.** A declared payment is never shown as paid through OpenStay, or as verified: OpenStay has no proof of it. `verified` is `true` only for a payment the provider said succeeded.
- **What follows.** A declared booking no longer lapses (request 30), cannot be paid through the provider, and gives no payout (request 33): the money never went through OpenStay. A cancellation of it refunds nothing through the provider.
- **Who.** Only the listing's host, or a manager of its organisation.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/declare-paid` | |
| `GET /v1/bookings/{id}` | `payment.status` may be `declared`; `payment` gains `verified` |
