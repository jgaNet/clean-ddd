# 5. A quote

Before booking, a traveller asks what a stay will cost. OpenStay takes nothing, and says so. Every euro is named before the traveller commits.

- **The city's tourist tax.** A host declares it on a listing, per guest and per night, in cents: 0 or more, and 0 until declared. It is collected for the city, not for the host.
- **Asking.** A signed-in traveller asks for a quote: a listing, a check-in, a check-out and a number of guests. The quote is refused when:
  - the listing is not published;
  - the guests are more than it takes;
  - the check-in is before today;
  - one of the nights cannot be booked;
  - the stay is shorter or longer than the listing takes;
  - the traveller is the listing's host.
- **What the quote shows,** line by line:
  - **The nights:** the nights times the nightly price, for the host.
  - **The cleaning fee,** for the host.
  - **The tourist tax:** guests times nights times the tax, an external fee, named.
  - **The platform's share:** zero.

  The total is the sum of the lines. Each line says whom it is for: `host`, `external` or `platform`. The quote also shows:
  - the cancellation policy the stay would be booked under;
  - when the quote stops being valid.

- **Valid for a while.** A quote is valid for `QUOTE_TTL_SECONDS` seconds, 1800 when that is not set.
- **A quote does not change.** If the host changes the price, the fee, the tax or the policy afterwards, a quote already given stays as it was.
- **Who reads it.** Only the traveller who asked for it.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/tourist-tax` `{ perGuestPerNight }` |  |
| `GET /v1/listings/{id}` | the listing gains `touristTax`, the amount per guest and night |
| `POST /v1/quotes` `{ listingId, checkIn, checkOut, guests }` | creates the quote, `{ id }` |
| `GET /v1/quotes/{id}` | `200 { id, listingId, checkIn, checkOut, guests, nights, lines: [ { label, for, amount } ], total, cancellationPolicy, validUntil }` |

`for` is one of `host`, `external` and `platform`. There is exactly one `platform` line, and its amount is 0.
