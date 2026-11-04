# 25. The conditions as they were accepted

When there is a dispute, both sides need to see exactly what was accepted, and when.

- **A booking's conditions.** The traveller, the host, and anyone who may read the booking read every version of the conditions it was under, oldest first: when each began (`since`, as an ISO 8601 time: when the booking was made, requested or confirmed at once, for the first) and who brought it (`by`, an account id: the traveller who booked, for the first; the traveller who changed the dates, for a change), the dates, the guests, the lines, the total, the cancellation policy and the house rules. The first version is the booking's own; a change of dates (request 19) adds one.
- **A traveller's quotes.** A traveller lists their quotes, the most recently given first, each with whether it is still valid: not past its `validUntil`, booked or not.
- **Nothing is rewritten.** A version, once there, never changes, whatever the listing or the booking does afterwards.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/bookings/{id}/conditions` | `200 [ { version, since, by, checkIn, checkOut, guests, lines, total, cancellationPolicy, houseRules } ]`, `version` from 1 |
| `GET /v1/quotes/mine` | `200 [ { id, listingId, checkIn, checkOut, guests, total, validUntil, valid } ]`, the most recent first |
