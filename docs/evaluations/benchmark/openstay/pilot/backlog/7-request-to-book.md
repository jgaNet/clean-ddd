# 7. Request to book

Some hosts want to say yes or no before a stay is confirmed.

- **The booking mode.** A host sets a listing's booking mode: `instant`, as until now, or `request`. Listings are `instant` until their host says otherwise.
- **A request.** Booking a listing in `request` mode, as request 6 books, makes a request, not a confirmed booking. The request holds its nights from the moment it is made:
  - nobody else can book or quote them;
  - the host cannot block them;
  - a search for them does not find the listing.
- **The host decides.**
  - The host accepts the request, and the booking is confirmed.
  - Or the host declines it, and its nights are free again.
  - Only the listing's host decides, and only while the request is waiting.
- **A request expires.** A request the host has not decided within `BOOKING_REQUEST_TTL_SECONDS` seconds (86400 when that is not set) is expired:
  - its nights are free again;
  - accepting or declining it is refused;
  - it reads as expired, without anyone having to act on it first.
- **Changes to the listing.** The mode can change at any time. A request already made stays a request.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/booking-mode` `{ mode }` | `mode` is `instant` or `request` |
| `GET /v1/listings/{id}` | the listing gains `bookingMode` |
| `POST /v1/bookings` `{ quoteId }` | as in request 6; for a `request` listing, the booking's `status` is `requested` |
| `POST /v1/bookings/{id}/accept` | the booking becomes `confirmed` |
| `POST /v1/bookings/{id}/decline` | the booking becomes `declined` |
| `GET /v1/bookings/{id}` | `status` may now also be `requested`, `declined` or `expired`; a waiting request also has `expiresAt` |
