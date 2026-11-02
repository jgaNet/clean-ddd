# 41. A fee per extra guest

A place for two that takes four costs the host more: more sheets, more water.

- **The fee.** A host sets, on a listing, how many guests the price includes (`fromGuests`, 1 to 20), and a fee per guest above it and per night, in cents (0 or more). There is none until set.
- **On the quote.** A stay for more guests than `fromGuests` gets a line of its own, `for` the host, named: the extra guests (the guests above `fromGuests`) times the nights times the fee. A stay for fewer guests, or a fee of 0, has no such line. Discounts (request 16) do not apply to it.
- **Kept as accepted.** Quotes and bookings already given keep what they showed.
- **Who.** Only the listing's host, or a manager of its organisation.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/extra-guests` `{ fromGuests, perGuestPerNight }` | |
| `GET /v1/listings/{id}` | gains `extraGuests: { fromGuests, perGuestPerNight }`, or `null` until set |
