# 14. Webhooks late, twice or out of order

The provider's webhooks are not reliable: some come twice, some come hours late, some overtake each other. A payment still changes a balance once.

- **Twice.** The provider may send the same webhook more than once, and may send two webhooks, under two ids, that say the same thing about the same payment. A payment counts in the balances once, however many webhooks say it succeeded.
- **Out of order.** A payment only moves forward: from `pending` to `succeeded`, or from `pending` to `failed`, and it ends there. A webhook that says a status the settlement has already had, or has gone past, changes nothing: a `pending` that arrives after the `succeeded` of the same payment leaves it `paid`.
- **Late.** A webhook may arrive long after the payment was decided, and after Tally was stopped and started again. It changes what it would have changed on time.
- **At the same moment.** The same webhook may reach two servers on the same database at once. It is counted once.
- **Always acknowledged.** In every one of these cases the webhook is acknowledged with a `2xx`, so that the provider stops sending it. A webhook that arrives while Tally is stopped is sent again by the provider, and acknowledged then.

The API works as request 1 says.

## The API

No route changes.
