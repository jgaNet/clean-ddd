# 42. Last-minute prices

An empty night is lost money. Hosts lower the price of stays that start soon.

- **The discount.** A host sets, on a listing, a last-minute discount: a percentage (0 to 50) for stays whose check-in is at most a number of days (1 to 30) from today. There is none until set.
- **One discount at a time.** A stay that could have several discounts (weekly, monthly, last-minute) gets the largest one only, as one line, named for it, on the nights only, rounded as request 16 says.
- **Kept as accepted.** Quotes and bookings already given keep what they showed.
- **Who.** Only the listing's host, or a manager of its organisation.

The API works as request 1 says. Days count as in request 17.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/last-minute` `{ withinDays, percent }` | |
| `GET /v1/listings/{id}` | gains `lastMinute: { withinDays, percent }`, or `null` until set |
