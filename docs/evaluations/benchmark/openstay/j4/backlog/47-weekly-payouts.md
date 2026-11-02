# 47. Weekly payouts

Hosts with many bookings would rather be paid once a week than once a booking.

- **A schedule.** A host chooses to be paid per booking (`daily`, as request 33 does, and the default) or `weekly`, on a weekday of their choice.
- **Weekly.** On that weekday (in UTC), everything due to the host is paid in one payout, which lists the bookings it pays. On other days, nothing is paid out to them.
- **Nothing lost.** Changing the schedule never pays a booking twice, and never skips one.
- **Who.** A host, for themselves.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/hosts/me/payout-schedule` `{ schedule, weekday }` | `schedule` `daily` or `weekly`; `weekday` `monday` … `sunday`, required for `weekly` |
| `GET /v1/hosts/me/payout-schedule` | `200 { schedule, weekday }`, `weekday` `null` for `daily` |
