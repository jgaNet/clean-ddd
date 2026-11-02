# 37. Reconciliation

Every day, someone checks that what the provider says moved matches what OpenStay believes moved.

- **Administrators.** The accounts whose email is in `ADMIN_EMAILS` (a comma-separated list) are OpenStay's administrators. Only they reconcile.
- **A day's reconciliation.** For a date, OpenStay reads the provider's transactions of that day (`GET /transactions?date=`) and compares them with its own record of the money it saw move that day: each payment, fee, refund and payout, by its `reference` and `type`.
- **How it compares.** Movements are matched by `type` and `reference`, the amounts of each pair added up on each side, signed as the provider signs them (money in positive). `matched` counts the pairs that agree.
- **What it shows.** How many matched, and every mismatch: a movement the provider has and OpenStay does not, one OpenStay has and the provider does not, or one whose amounts differ. Each with its `type`, its `reference`, and both amounts (`null` on the side that has none).

The API works as request 1 says; the provider's transactions are request 26's:

| Provider request | Answer |
| --- | --- |
| `GET /transactions?date=YYYY-MM-DD` | `200 [ { id, type, amount, reference, object, at } ]`, money in positive, out negative |

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/admin/reconciliation?date=YYYY-MM-DD` | `200 { date, matched, mismatches: [ { type, reference, provider, openstay } ] }`, for an administrator; `403` for anyone else |
