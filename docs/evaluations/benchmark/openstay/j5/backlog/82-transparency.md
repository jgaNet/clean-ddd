# 82. Transparency indicators

OpenStay lives on what people give, and says in the open what it costs to run: month by month, anyone sees the bookings, what the provider took, what was given, and what each booking cost.

- **Running costs.** An administrator (an account whose email is in `ADMIN_EMAILS`, a comma-separated list, request 37) enters what running OpenStay cost in a month, in cents, 0 or more: everything but the provider's fees. Entering it again replaces it. A month with nothing entered reads 0.
- **The indicators of a month,** read by anyone, signed in or not:
  - `bookings`: the bookings confirmed during the month, at once (request 6) or when their host accepted the request (request 7), whatever happened to them since (cancelled, changed, lapsed);
  - `providerFees`: the provider's fees of every payment through the provider that succeeded during the month, those of bookings (request 27) and those of donations (request 80), each as the provider gave it in `payment.succeeded`;
  - `donations`: the amounts of the donations paid during the month, before the provider's fee;
  - `runningCosts`: what the administrator entered for the month;
  - `costPerBooking`: `runningCosts` plus `providerFees`, divided by `bookings`, rounded half up to the cent; `null` when there was no booking. For example, 50,000 of running costs and 1,234 of fees over 40 bookings: 51,234 ÷ 40 = 1,280.85, so 1,281.
- **When.** A payment or a donation counts in OpenStay's month, by its clock (request 57, `CLOCK_OFFSET_DAYS` included), at the moment it learns from `payment.succeeded` that it succeeded, whatever time the webhook carries; a booking, in the month it was confirmed. A later refund, cancellation or lapse takes nothing out of a month. A payment that failed counts nothing. Months are in UTC, by OpenStay's time (request 57: the machine's time plus `CLOCK_OFFSET_DAYS`).
- **Nothing private.** The page shows these numbers only: no booking, no host, no traveller, no donor.
- **The audit log.** Each entry of running costs is an entry of the audit log (request 67), `{ id, at, adminId, action, subjectId, note }`: `action` `running-costs-set`, `subjectId` the month (`2026-10`), `note` `null`. It is read at `GET /v1/admin/audit?subjectId=<month>`, oldest first.
- **Who.** Only administrators enter running costs: the route answers `403` to anyone else.

The API works as request 1 says. `{month}` and `month` are `YYYY-MM`; a month that is not one is refused (`400` for the page).

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/admin/running-costs/{month}` `{ amount }` | |
| `GET /v1/transparency?month=YYYY-MM` | `200 { month, bookings, providerFees, donations, runningCosts, costPerBooking }` |
| `GET /v1/admin/audit?subjectId=` | as request 67; `action` may now be `running-costs-set` |
