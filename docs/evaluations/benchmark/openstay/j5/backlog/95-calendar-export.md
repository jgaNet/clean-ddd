# 95. Calendar export

Hosts also let their places on other sites. Those sites read a calendar address and block the nights OpenStay already gave away, so that nobody books the same night twice.

- **A secret address.** Each listing has a calendar address, secret: whoever knows it reads the listing's calendar without signing in. The host side reads it: `url`, the path from the server's root, `/v1/calendars/<secret>.ics`. The secret is at least 32 letters and digits, and does not contain the listing's id. It is made the first time it is read, and is the same on every later read, across a restart and on every server.
- **Replacing it.** The host side replaces the secret. The new address works at once; the old one answers `404` at once, on every server.
- **Who.** The listing's host, and the managers of its organisation (request 24), read and replace the address. To anyone else the routes answer `404`.
- **What the file holds.** `GET` on the address answers `200` with `Content-Type: text/calendar`, an iCalendar file (RFC 5545), lines ending with CRLF:
  - `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//OpenStay//Calendar//EN`, then the events, then `END:VCALENDAR`;
  - one event per booking that holds nights (a booking `confirmed`, or a request still waiting, request 7), and one per run of consecutive nights the host blocked (requests 4 and 22), whose last night is today or later;
  - each event is `BEGIN:VEVENT`, `UID:`, `DTSTAMP:` (a time, `YYYYMMDDTHHMMSSZ`), `DTSTART;VALUE=DATE:YYYYMMDD` (the first night), `DTEND;VALUE=DATE:YYYYMMDD` (the day after the last night: a booking's check-out), `SUMMARY:Booked` or `SUMMARY:Blocked`, `END:VEVENT`.
- **Nothing private.** No name, email, amount or booking detail is in the file: only the dates.
- **Stable.** A booking's event has the same `UID` on every read, after a change of its dates (request 19) too, which moves its dates. A cancelled, declined, expired or lapsed booking, a hold (request 20) and a night freed are not in the file. Each `UID` appears once in a file.
- **Today** is the server's date, moved by `CLOCK_OFFSET_DAYS` (request 57).

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/listings/{id}/calendar-link` | `200 { url }` |
| `POST /v1/listings/{id}/calendar-link/rotate` | `{ url }`, the new one |
| `GET /v1/calendars/{secret}.ics` | `200`, the iCalendar file, no sign-in; `404` for a secret that is not, or no longer, a listing's |
