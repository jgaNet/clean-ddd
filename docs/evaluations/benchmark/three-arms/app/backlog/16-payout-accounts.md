# 16. Payout accounts

The provider pays money out to an account it knows. A member who wants to be paid by card tells Tally which account is theirs.

- **A payout account.** A signed-in person sets the account the provider pays them on: the provider's id of that account. Tally asks the provider whether it knows it:

  | Tally asks the provider               | The provider answers                           |
  | ------------------------------------- | ---------------------------------------------- |
  | `GET {PROVIDER_URL}/accounts/{id}`    | `200 { id }` when it knows it; `404` otherwise |

  An account the provider does not know is refused. When the provider answers anything else, or does not answer within 5 seconds, it is refused too. Setting another account replaces the one they had. They read their own payout account; nobody else does.
- **Required to be paid through the provider.** From now on, a member is paid through the provider only when they have a payout account: asking to pay someone who has none (request 13) is refused, by the name of that rule, and nothing is asked of the provider.
- **Where the money goes.** Tally's request for a payment (request 13) also says the payee's payout account: `POST {PROVIDER_URL}/payments` `{ reference, amount, currency, payee }`, `payee` being the payee's payout account at the moment Tally asks.
- **What does not change.** A settlement in cash needs no payout account. A payment already asked for goes on as it was.

The API works as request 1 says.

## The API

| Request                                                 | Answer                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `PUT /v1/accounts/me/payout-account` `{ accountId }`    | sets the caller's payout account, the provider's id of it  |
| `GET /v1/accounts/me/payout-account`                    | `200 { accountId }`; `404` when the caller has none        |
