# 4. The host's calendar

A host decides which nights a listing can be booked, and for how long.

- **Blocking nights.**
  - The host blocks a range of nights: from a date, up to the night before another. Nobody can book them.
  - The host frees blocked nights the same way. Freeing a night that is not blocked changes nothing.
  - A range has at least one night and at most 365.
  - Once bookings exist (a later request), a night that is booked cannot be blocked.
- **The length of a stay.** The host sets the shortest and the longest stay the listing takes, in nights.
  - The shortest is at least 1, and the longest at most 365.
  - The shortest is not above the longest.
  - Until the host sets them, they are 1 and 365.
- **The calendar.** Anyone who can see the listing reads its calendar for a range of dates: whether each night can be booked. A night is blocked or not here. Later requests add the other reasons a night is taken.
- **Search.** A listing is not found by a search for a stay when:
  - one of the stay's nights is blocked;
  - or the stay is shorter or longer than the listing takes.
- **Who acts.** Only the listing's host blocks, frees and sets the limits.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/listings/{id}/block` `{ from, to }` | blocks the nights from `from` to the night before `to` |
| `POST /v1/listings/{id}/unblock` `{ from, to }` | frees them |
| `PUT /v1/listings/{id}/stay-limits` `{ minNights, maxNights }` |  |
| `GET /v1/listings/{id}/calendar?from=&to=` | `200 [ { date, available } ]`, one per night from `from` to the night before `to`, in date order |
| `GET /v1/listings/{id}` | the listing gains `minNights` and `maxNights` |
