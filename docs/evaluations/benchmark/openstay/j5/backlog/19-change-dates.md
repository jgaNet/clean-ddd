# 19. Changing a booking's dates

Plans move by a day or two. A traveller changes the dates of a confirmed booking rather than cancel it and book again.

- **The change.** The traveller who made a confirmed booking gives new check-in and check-out dates. The change is made at once if the listing can give every new night: the nights the booking held already count as its own. The old nights the new stay does not keep are free again.
- **The price.** The new stay is priced as a quote for those dates would be, at the listing's terms of today, and the booking's lines and total are replaced. The cancellation policy and the house rules stay the booking's own.
- **What it refuses.** Everything a quote for the new dates would refuse (nights taken by someone else, the stay's length, the booking window, the arrival days), a booking that is not confirmed, and anyone but its traveller.
- **The history.** The change is a step of the booking's history (request 9), `changed`, made by the traveller.
- **The host is not notified again** (request 10): the booking is the same booking.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/change-dates` `{ checkIn, checkOut }` | |
| `GET /v1/bookings/{id}` | the new dates, lines and total |
| `GET /v1/bookings/{id}/history` | `status` may now also be `changed` |
