# 39. Settle up in another currency

Bob owes Ann 50 euros from the trip, and has only Swiss francs left. Ann takes them, at the day's rate.

- **In another currency.** A settlement in cash (request 12), or through the provider (request 13), gives either its `amount`, in the group's currency, as before, or `original`: what is paid in another currency, with its `currency`, one of Tally's (request 2) other than the group's, and its `amount` in that currency's hundredths, from 1 to 100 000 000. A body with neither, or with both, is of the wrong shape.
- **The rate is fixed when it is decided.** Tally asks the rates service (request 22) for the rate of that currency to the group's on the day the settlement is decided, in UTC, and takes it: the payer does not give a rate. When there is no rate offered, the settlement is refused, and nothing is kept, nor is the provider asked.
- **The amount in the group's currency** is the original amount times that rate, to the nearest whole number, a half up, as for an expense (request 21). It is the settlement's `amount`: what the rules of a settlement hold (never more than is still owed, requests 12 and 13), and what the balances, the statements and the audit count.
- **Through the provider,** Tally asks for the payment in the currency and the amount paid: `POST {PROVIDER_URL}/payments` `{ reference, amount, currency, payee }` with the original amount and its currency. The provider's fee (request 38) is in that currency; it is converted at the settlement's rate, the same way, before the part its payer bears is taken off, and the settlement's `fee` reads it in the group's currency, as its `amount` is.
- **Kept.** A settlement keeps its rate as it was when it was decided, whatever the rates service says later: a payment that lands days later counts the amount decided then, and so does a refund. It reads `original: { currency, amount, rate }`, the rate as the rates service wrote it; a settlement in the group's currency reads as before, without `original`.

The API works as request 1 says.

## The API

| Request                                                                     | Answer                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /v1/groups/{id}/settlements/cash` `{ from, original: { currency, amount } }`  | as in request 12, paid in another currency                                          |
| `POST /v1/groups/{id}/settlements/provider` `{ to, original: { currency, amount } }` | as in request 13, paid in another currency                                         |
| `GET /v1/settlements/{id}`                                                  | a settlement in another currency also has `original: { currency, amount, rate }`; its `amount` is the group currency's |
