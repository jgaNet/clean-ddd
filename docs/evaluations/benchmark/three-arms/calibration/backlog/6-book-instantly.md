# 6. Book instantly

A traveller books a stay from their quote, and it is confirmed at once.

- **Booking.** A signed-in traveller books from a quote of theirs that is still valid. The booking is confirmed if every night of the stay can still be booked. It keeps everything the quote showed: the lines, the total and the cancellation policy, whatever the listing says afterwards.
- **It is refused when:**
  - the quote is someone else's;
  - the quote is no longer valid;
  - the listing is no longer published;
  - one of the nights has been taken since the quote.
- **Never the same night twice.** Several travellers may book the same nights at the same moment. However many there are, and however many servers run on the same database, exactly one is confirmed and every other one is refused.
- **Booking twice by mistake.** A traveller may send the same booking again, after a timeout for instance. A request that carries an `Idempotency-Key` header with the key of an earlier booking by the same traveller makes no new booking: it answers that booking's id.
- **Booked nights are taken.**
  - The calendar shows them unavailable.
  - A search for any of them does not find the listing.
  - No quote is given for them.
  - The host cannot block them.
- **Who sees a booking.** The traveller who made it and the listing's host. Each lists theirs:
  - the traveller, their bookings;
  - the host, a listing's bookings;
  - the most recently made first, in both.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings` `{ quoteId }`, optionally with `Idempotency-Key: <key>` | creates the booking, `{ id }` |
| `GET /v1/bookings/{id}` | `200 { id, listingId, travellerId, hostId, checkIn, checkOut, guests, lines, total, cancellationPolicy, status }`, with `status` `confirmed` |
| `GET /v1/bookings/mine` | `200 [ booking ]`, the traveller's, the most recently made first |
| `GET /v1/listings/{id}/bookings` | `200 [ booking ]`, for its host, the most recently made first |
