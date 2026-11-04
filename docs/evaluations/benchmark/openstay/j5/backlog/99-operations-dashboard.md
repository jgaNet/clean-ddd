# 99. The operations dashboard

On a bad morning, an administrator needs to see in one glance what is waiting for OpenStay's people, without opening six lists.

- **Administrators.** The accounts whose email is in `ADMIN_EMAILS` (a comma-separated list, request 37). Only they read the dashboard: anyone else gets `403`. Reading it changes nothing and is no entry of the audit log.
- **What it counts,** each as it is at the moment it is read:
  - `bookingsToday`: the bookings made today, confirmed at once or requested (requests 6 and 7), whatever their status since.
  - `failedPaymentsToday`: the bookings' payments at the provider that failed today, by a `payment.failed` webhook (request 27) received today; each payment once, even when its webhook comes twice (request 29).
  - `heldPayouts`: the bookings owed a payout (request 33: paid through the provider, their check-in begun, something still to pay the host) that waits because their host has no enabled payout account (requests 26 and 34) or because their payment is disputed (request 39). A booking waiting only for its host's weekday (request 47) is not held.
  - `openReports`: the reports not yet closed (request 64), of every kind: `listing`, `message` and `review`.
  - `openClaims`: the claims waiting for a decision (request 71): `open` and `answered`.
  - `unansweredTickets`: the support tickets (request 74) whose status is `open`: opened, or replied to by their user, and not answered since.
- **Today** is the server's date, in UTC, moved by `CLOCK_OFFSET_DAYS` (request 57: the server takes as now the machine's time plus that many days, 0 when that is not set).

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/admin/dashboard` | `200 { bookingsToday, failedPaymentsToday, heldPayouts, openReports, openClaims, unansweredTickets }`, each a number |
