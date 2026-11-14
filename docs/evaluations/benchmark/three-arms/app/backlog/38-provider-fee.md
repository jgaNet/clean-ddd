# 38. Who bears the provider's fee

The provider keeps a fee on every payment. Bob paid Ann 30 euros by card and Ann received 29.40: who lost the 60 cents?

- **The provider's fee.** From now on the provider says its fee when Tally asks it for a payment (request 13): it answers `201 { id, payUrl, fee }`, `fee` a whole number, 0 or more, in the hundredths of the payment's currency, which it keeps out of what it pays the payee. An answer without such a fee is not an answer: the payment is refused, and nothing is kept. So is one whose fee is not less than the amount.
- **Who bears it.** Each group decides, through its owner: its payer, its payee, or both, shared. Until the owner decides, the payee bears it, as they did before this request. Only the owner changes it; any other member is refused.
- **What a payment settles.** A settlement through the provider settles its amount less the part of the fee its payer bears:
  - **the payee bears it:** it settles its whole amount;
  - **the payer bears it:** it settles its amount less the fee: its payer still owes the fee;
  - **shared:** each bears half of it; when the fee is odd, the payee bears the extra hundredth. It settles its amount less the payer's half.

  What it settles is what everything that counts a settlement counts (requests 12 to 33): the balances once it is paid, what is still owed while it waits, the statement (its `paid` and `share`), the audit (its `amount`). Its `amount` stays the one asked for, and is what the provider is asked for.

  For instance, Bob pays Ann 300 through the provider, and the provider's fee is 31. Ann bearing it, it settles 300; Bob bearing it, 269; shared, Bob bears 15 and it settles 285.
- **Fixed when it is asked for.** A settlement keeps the fee the provider said and who bore it when its payment was asked for: changing who bears it later changes no settlement. A settlement asked for before this request has no fee, and settles its amount.
- **Reading it.** A group's members read who bears its fee. A settlement through the provider asked for from now on also reads `fee`: the fee's `amount` and who bore it (`borneBy`: `payer`, `payee` or `shared`).

The API works as request 1 says.

## The API

| Request                                              | Answer                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /v1/groups/{id}/fee-policy`                     | `200 { borneBy }`: `payer`, `payee` or `shared`                                               |
| `PUT /v1/groups/{id}/fee-policy` `{ borneBy }`       | sets who bears the provider's fee in the group                                                |
| `GET /v1/settlements/{id}`                           | through the provider, asked for from now on, also `fee: { amount, borneBy }`                  |
