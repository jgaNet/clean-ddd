# 15. Refund through the payment provider

Ann was paid twice for the same dinner, once in cash and once by card. She gives the card payment back.

- **Refunding.** The payee of a settlement paid through the provider (request 13) refunds it, whole. Only its payee may, and only while its status is `paid`. A settlement in cash is not refunded through Tally. A settlement whose payer or payee is no longer a member of the group (request 9) is not refunded either, so that the balances of the group still add up to 0. Anything else is refused, and nothing changes.
- **Asking the provider.** Tally asks the provider to refund the payment:

  | Tally asks the provider                                       | The provider answers |
  | ------------------------------------------------------------- | -------------------- |
  | `POST {PROVIDER_URL}/payments/{paymentId}/refunds` `{ reference }` | `201 { id }`         |

  `paymentId` is the provider's id of the payment, and `reference` the settlement's id. When the provider answers anything else, or does not answer within 5 seconds, the refund is refused and nothing changes. Otherwise the settlement is `refunding`: the money has not gone back yet, and the balances still count it as paid.
- **The provider tells Tally.** A payment that succeeded may later be refunded at the provider, and its webhook (request 13) then says `refunded`. The settlement is `refunded`, and the balances no longer count it: they are as they were before it was paid.
- **In order.** A payment moves forward from `succeeded` to `refunded`, and ends there. Request 14 holds for refunds: a `refunded` said twice counts once, and a `succeeded` or a `pending` that arrives after it changes nothing. A `refunded` that overtakes the `succeeded` of the same payment leaves the settlement `refunded`, never counted.
- **Reading a settlement** (requests 12 and 13): its `status` may now be `refunding` or `refunded`.

The API works as request 1 says.

## The API

| Request                                    | Answer                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `POST /v1/settlements/{id}/refund`         | asks the provider to refund the settlement                                  |
| `POST /v1/provider/webhooks`               | `status` may now be `refunded` (request 13)                                 |
| `GET /v1/settlements/{id}`                 | `status` may now be `refunding` or `refunded`                               |
