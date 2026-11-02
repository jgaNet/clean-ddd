# 43. Promotion codes

Hosts give codes to friends and returning guests.

- **A code.** A host creates, on a listing, a code: 4 to 20 letters and digits, case-insensitive, unique on the listing, a percentage (1 to 50), and a number of uses (1 or more).
- **Quoting with it.** A traveller may give a code when asking for a quote. A code that exists on the listing and has uses left gives its discount on the nights, as a line of its own, named, in place of any other discount if it is larger (request 42's rule: the largest one only). An unknown code, or one with no use left, refuses the quote.
- **On the quote, and using it.** A quote keeps its code (in capitals) only when the code's discount is the one it applied; otherwise its `code` is `null`. A booking made from a quote with a code uses one use of it. The last use cannot be used twice: of two bookings made at the same moment with the last use, one is refused. A cancelled booking does not give its use back.
- **Who.** The listing's host, or a manager of its organisation, creates and lists codes, with their uses left.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/listings/{id}/codes` `{ code, percent, uses }` | creates the code, `{ id }` |
| `GET /v1/listings/{id}/codes` | `200 [ { id, code, percent, uses, usesLeft } ]`, in the order they were created; `code` in capitals |
| `POST /v1/quotes` `{ listingId, checkIn, checkOut, guests, code }` | `code` may be given |
| `GET /v1/quotes/{id}` | gains `code`, or `null` |
