# 13. Pay through the payment provider

Not everyone carries cash. A member pays what they owe by card, through a payment provider, and Tally learns from the provider when the money has moved.

- **The provider.** An outside system, with an API of its own. The server is started with `PROVIDER_URL`, the base of the provider's API (without a trailing slash), and `PROVIDER_WEBHOOK_SECRET`, a secret Tally and the provider share. Without `PROVIDER_URL`, paying through the provider is refused.
- **Asking to pay.** A member who owes another member of the group asks to pay them an amount through the provider. The member who asks is the settlement's payer; the other is its payee. The same rules as a settlement in cash hold (request 12): the payee is a member of the group, not the payer; the amount is a whole number, at least 1, and never more than what the payer still owes, nor more than what the payee is still owed.
- **What is still owed.** A payment waiting at the provider counts as if it were paid: what a member still owes is what they owe, less what they are waiting to pay; what a member is still owed is what they are owed, less what is waiting to be paid to them. That holds for this rule, for a settlement in cash (request 12), and for the suggested settlements (request 11). The group's balances count a payment once it is paid, and not before.
- **The payment link.** To decide, Tally asks the provider for a payment:

  | Tally asks the provider                                         | The provider answers           |
  | --------------------------------------------------------------- | ------------------------------ |
  | `POST {PROVIDER_URL}/payments` `{ reference, amount, currency }` | `201 { id, payUrl }`           |

  `reference` is the settlement's id, and `currency` the group's. When the provider answers anything else, or does not answer within 5 seconds, the request is refused and nothing is kept. Otherwise the settlement is kept, its status `pending`, with the provider's `payUrl`: the link where the payer pays.
- **The provider tells Tally.** A payment at the provider is `pending` until it ends, once: it `succeeded`, or it `failed`. The provider tells Tally with a webhook, `POST /v1/provider/webhooks`, whose JSON body is `{ id, paymentId, status, at }`: the webhook's own id, the payment's id (the `id` the provider answered), its status (`pending`, `succeeded` or `failed`) and when the provider decided it. It signs it: the header `Provider-Signature` is the HMAC-SHA256 of the body, exactly as sent, with `PROVIDER_WEBHOOK_SECRET` as the key, in lowercase hexadecimal.
  - A webhook without a signature, or with a wrong one, is refused with `401`, and changes nothing.
  - A signed webhook is acknowledged with a `2xx`, whatever it says: the provider then stops sending it. A webhook about a payment Tally does not know changes nothing.
  - `succeeded`: the settlement is `paid`, and the balances count it, as a settlement in cash.
  - `failed`: the settlement is `failed`. The balances never count it, and it is no longer waiting.
  - `pending`: nothing changes.
- **Reading a settlement** (request 12): `method` is `provider`; `status` is `pending`, `paid` or `failed`; and a settlement through the provider also has its `payUrl`.

The API works as request 1 says.

## The API

| Request                                                      | Answer                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/settlements/provider` `{ to, amount }` | asks the provider for a payment, the caller its payer, `{ id }`; `to` is the payee's account id         |
| `POST /v1/provider/webhooks` `{ id, paymentId, status, at }` | the provider's webhook, signed: `2xx` once acknowledged, `401` when the signature is missing or wrong   |
| `GET /v1/settlements/{id}`                                   | `method` is `cash` or `provider`, `status` `paid`, `pending` or `failed`; through the provider, `payUrl` |
