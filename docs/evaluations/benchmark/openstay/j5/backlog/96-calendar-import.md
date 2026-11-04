# 96. Calendar import

A host who lets a place on other sites wants the nights booked there blocked here, without copying them by hand.

- **Linking calendars.** The listing's host, or a manager of its organisation (request 24), gives the addresses of outside calendars: up to 10, each an `http://` or `https://` URL. Giving the list again replaces it. Its host and the managers and viewers of its organisation read the list, with, for each address, when it was last fetched and when last fetched successfully.
- **The sweep.** At each run of the work nobody asks for (request 30: at least every `JOBS_INTERVAL_SECONDS` seconds, 60 when that is not set), every linked address is fetched with a `GET`. With two servers running, the outcome is the one a single server gives.
- **What is read.** A successful fetch is a `2xx` answer, within 10 seconds, whose body is an iCalendar file: `BEGIN:VCALENDAR` … `END:VCALENDAR`, lines ending with CRLF or LF. From each event between `BEGIN:VEVENT` and `END:VEVENT`, three properties are read, and nothing else:
  - `UID:`, which tells events apart;
  - `DTSTART;VALUE=DATE:YYYYMMDD`, the first night;
  - `DTEND;VALUE=DATE:YYYYMMDD`, the day after the last night. An event with `DTSTART` and no `DTEND` is one night.

  An event with no `UID`, with dates not written that way, or with a `DTEND` not after its `DTSTART`, is ignored.
- **Blocking.** Each event blocks its nights, from today on, as the host's blocks do (request 4): the calendar shows them unavailable, they cannot be quoted, booked or held, and a search for them does not find the listing. A night a booking (confirmed, or a request still waiting) or a hold already has stays theirs: an event takes nothing from them.
- **Following the outside calendar.** At each successful fetch, the nights follow the events as they now are: an event whose dates moved blocks its new nights, and an event that disappeared frees its nights, unless another event, of that calendar or another, still blocks them. An address removed from the list frees, at once, the nights only its events blocked.
- **A fetch that fails changes nothing.** An address that answers an error, does not answer within 10 seconds, or answers something that is not a calendar leaves its nights as its last successful fetch left them, and is fetched again at the next sweep.
- **The host's own blocks stay apart.** An event never frees a night the host blocked, and the host's unblock (request 4) frees only the host's own blocks: a night an event blocks stays blocked until the event goes.
- **Seen in the calendar.** Each night of the calendar (request 4) gains `source`: `import` for a night an imported event blocks, `null` otherwise.
- **Not exported again.** Nights blocked by an imported event are not in the listing's calendar export (request 95): they belong to the other site.
- **Today** is the server's date, moved by `CLOCK_OFFSET_DAYS` (request 57).

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/imported-calendars` `{ urls }` | `urls` a list of addresses |
| `GET /v1/listings/{id}/imported-calendars` | `200 [ { url, lastAttemptAt, lastSyncAt } ]`, in the order given; each time `null` until it happens |
| `GET /v1/listings/{id}/calendar?from=&to=` | each night gains `source`: `import` or `null` |
