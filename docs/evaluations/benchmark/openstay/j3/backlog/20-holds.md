# 20. Holding nights while deciding

A traveller who is still deciding may hold nights for a little while, so that nobody takes them meanwhile.

- **A hold.** A signed-in traveller holds nights of a published listing, for a number of guests, for `HOLD_TTL_SECONDS` seconds (900 when that is not set). A hold is refused for everything a quote would refuse.
- **What it holds.** While it lasts, the held nights are taken for everyone else: they cannot be quoted, booked (even with a quote given before the hold), held or blocked, a search for them does not find the listing, and the calendar shows them unavailable.
- **Booking it.** The traveller who holds the nights quotes and books them as usual: for them, the hold does not take the nights. The hold is used up when its traveller books a stay that shares a night with it. The calendar and the search show the held nights as taken whoever asks.
- **Its end.** A hold ends when its traveller releases it, when it is used, or when its time has passed, and its nights are free again at once.
- **A limit.** A traveller holds at most three stays at a time; a fourth is refused.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/holds` `{ listingId, checkIn, checkOut, guests }` | creates the hold, `{ id }` |
| `POST /v1/holds/{id}/release` | |
| `GET /v1/holds/mine` | `200 [ { id, listingId, checkIn, checkOut, guests, expiresAt } ]`, the traveller's holds still running |
