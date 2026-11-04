# 28. Strong authentication

Banks ask travellers to prove it is them. The provider may hold a payment until the traveller acts.

- **Action required.** When the provider sends `payment.requires_action`, the booking's payment reads `requires_action`, with the `actionUrl` the provider gave, where the traveller acts.
- **Then.** It stays so until the provider says the payment succeeded or failed, as request 27 says. A traveller who never acts leaves the payment where it is.
- **Paying again.** While a payment waits for the traveller's action, asking to pay gives the same payment and its `actionUrl`, never a second payment.

The API works as request 1 says; the webhook is request 26's:

| Provider webhook | `data` |
| --- | --- |
| `payment.requires_action` | the payment, and the `actionUrl` |

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/bookings/{id}` | `payment.status` may be `requires_action`, and `payment` then has `actionUrl` |
| `POST /v1/bookings/{id}/pay` | answers `{ paymentId, payUrl, actionUrl }` for a payment waiting for the traveller |
