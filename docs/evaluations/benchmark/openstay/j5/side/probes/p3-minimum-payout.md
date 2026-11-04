# P3. A minimum payout

Small payouts cost hosts a bank fee each. A host may ask to be paid only once enough is due.

- **A minimum per currency.** A host sets a minimum for a currency of request 87: an integer of its minor unit, 0 or more. 0, the default, means no minimum.
- **Waiting.** A payout whose amount would be below the host's minimum in its currency is not sent: what it would have paid waits. Whatever comes due later in that currency is added to it, and everything due is paid in one payout once it reaches the minimum.
  - **Per booking** (request 47's `daily`): the bookings that waited are paid together, in one payout that lists them all, with a `reference` of OpenStay's own, at the first run of the work at which the total reaches the minimum.
  - **Weekly:** on the host's weekday, if the total due in a currency is below its minimum, nothing is paid in it that week; what is due is carried to the next weekday.
  - A payout that pays a single booking keeps the booking's id as its `reference`, as before.
- **Changing it.** A new minimum holds from the next run of the work. Lowering it, or setting it to 0, pays what is due at that run if it now reaches the minimum (on the weekday, for a weekly host).
- **Never lost, never twice.**
  - What waits is still due. A failed payout (request 34) is owed again, and counts toward the minimum.
  - Each booking is paid out once, across a crash and on two servers.
  - What waits under a minimum is not held by the pause (request 100), nor counted in the dashboard's `heldPayouts` (request 99).
- **Who.** A host, for themselves.

The API works as request 1 says; the work runs every `JOBS_INTERVAL_SECONDS` at least (request 30).

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/hosts/me/payout-minimum/{currency}` `{ amount }` | an unknown currency or a negative amount is refused |
| `GET /v1/hosts/me/payout-minimum/{currency}` | `200 { currency, amount }`, `amount` 0 when never set |
| `GET /v1/hosts/me/payouts` | as request 89; a payout may list several bookings under either schedule |
