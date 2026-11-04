# 97. Import conflicts

Sometimes another site gives away a night OpenStay already sold. The booking made here must stand, and the host must hear of it at once.

- **The import, as request 96 says.** A host links outside calendars to a listing; at each sweep (every `JOBS_INTERVAL_SECONDS`, request 30) each is fetched, and each event (`UID`, `DTSTART;VALUE=DATE`, `DTEND;VALUE=DATE`, one night when there is no `DTEND`) blocks its nights. A night a booking already has stays the booking's.
- **A conflict.** An imported event whose nights share at least one night with a confirmed booking of the listing (`status` `confirmed`). The nights they share stay the booking's: the event blocks nothing on them, and blocks its other nights as before. Nothing about the booking changes.
- **While it lasts.** The conflict is listed until the event no longer shares a night with the booking: the event disappeared or moved, the calendar was unlinked, or the booking is no longer confirmed (cancelled, lapsed) or no longer on those nights (a change of dates, request 19). A booking that leaves frees its nights; an event still there blocks them at the next sweep.
- **A request accepted later.** A request (request 7) still waiting keeps its nights as a booking does, but is no conflict. Once accepted, it is one from the next sweep.
- **The host is told.** For each conflict, the listing's host gets a notice: `POST {NOTIFY_URL}` with the body `{ id, kind: "calendar-conflict", hostId, bookingId, listingId, url, uid, from, to, lang }`. `url` is the calendar's address, `uid`, `from` and `to` the event's (`from` its first night, `to` the day after its last), and `lang` the host's language (request 86).
  - It is sent as request 10 sends notices: again, with the same body, until the service accepts it with a `2xx`, and never lost to a crash.
  - Once per event (its calendar and its `UID`) and booking: not at every sweep, not again when the event moves, not twice with two servers or after a restart.
  - It cannot be turned off (request 75 turns off only `message`, `booking-requested`, `booking-confirmed` and `review`).
  - Without `NOTIFY_URL`, nothing is sent; the conflict is listed all the same.
- **Who reads the conflicts.** The listing's host, and the managers and viewers of its organisation (request 24). To anyone else the route answers `404`.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/listings/{id}/calendar-conflicts` | `200 [ { bookingId, url, uid, from, to } ]`, the conflicts as they are now, in the order of the booking's check-in, then `uid` |
