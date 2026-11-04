# 93. A cap on nights per year

Some cities limit how many nights a home may be let to visitors in a year. OpenStay should refuse the booking that would pass the limit, rather than leave the host to find out from the city.

- **A city's cap.** An administrator (an account whose email is in `ADMIN_EMAILS`, a comma-separated list, request 37) sets a city's cap: a number of `nights`, from 1 to 365, or `null` to lift it. Setting it again replaces it. No city has a cap until an administrator sets one.
- **Which listings.** Every listing whose `city` is that city, whatever its case, as search matches it (request 3). The cap is per listing, not per host.
- **What counts.** For a listing and a calendar year, the nights of its confirmed bookings (`status` `confirmed`) that fall in that year, by their current dates (after a change of dates, request 19). A request still waiting (request 7), a declined, expired, cancelled or lapsed booking counts nothing. A stay across the new year counts each night in the year of its date.
- **What is refused.** Anything that would make a listing's nights in a year more than its city's cap:
  - a booking confirmed at once (request 6);
  - the host's acceptance of a request (request 7): the request then stays waiting, until it is declined or expires;
  - a change of dates (request 19), where the booking's own old nights no longer count.

  Making a request, a quote, a hold or a search is not refused by the cap. For example, with a cap of 10 and 8 nights confirmed in 2027, a booking of 3 nights in 2027 is refused, and one of 2 is confirmed.
- **Two at once.** Of two bookings, acceptances or changes made at the same moment that would each stay within the cap alone but not together, one succeeds and the other is refused, on one server or on two on the same database.
- **Nothing undone.** Bookings already confirmed stay, even when a cap set later is already passed: the cap only refuses what comes after it.
- **Seen.** An administrator reads a city's cap. The listing's host side (its host, and the managers and viewers of its organisation, request 24) reads how many nights a listing has counted in a year, and its cap.
- **The audit log.** Each cap set or lifted is an entry of the audit log (request 67), `{ id, at, adminId, action, subjectId, note }`: `action` `city-night-cap-set`, `subjectId` the city in lower case, `note` `null`. It is read at `GET /v1/admin/audit?subjectId=<city in lower case>`, oldest first.
- **Who.** The administrator routes answer `403` to anyone else.

The API works as request 1 says. `{city}` is the city's name, URL-encoded.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/admin/cities/{city}/night-cap` `{ nights }` | `nights` a number, or `null` |
| `GET /v1/admin/cities/{city}/night-cap` | `200 { nights }`, `null` when there is no cap |
| `GET /v1/listings/{id}/nights-booked?year=YYYY` | `200 { year, nights, cap }`, `cap` `null` when its city has none |
