# 39. Disputes

A traveller's bank may take a payment back: the traveller disputes it.

- **Disputed.** When the provider says `dispute.created` for a booking's payment, the booking's payment reads `disputed: true`. Its payout (request 33) is held, and not made while the dispute is open.
- **Closed.** When the provider says `dispute.closed`: if `won`, the payout goes ahead as before; if `lost`, the disputed amount is gone, the host is paid nothing more for the booking, and the host's statement (request 35) shows a line `dispute` for it. Either way, `disputed` reads `false` again, and the payment gains `dispute: { outcome }`.
- **Already paid out.** A dispute on a booking already paid out changes no payout; a lost one still shows on the statement.

The API works as request 1 says; the webhooks are request 26's:

| Provider webhook | `data` |
| --- | --- |
| `dispute.created` | `{ id, payment, amount }` |
| `dispute.closed` | `{ id, payment, amount, outcome }`, `outcome` `won` or `lost` |

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/bookings/{id}` | `payment` gains `disputed`, and `dispute: { outcome }` once one is closed |
