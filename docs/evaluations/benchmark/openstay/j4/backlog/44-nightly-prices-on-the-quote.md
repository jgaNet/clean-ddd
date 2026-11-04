# 44. Each night's price on the quote

Travellers want to see why a stay costs what it costs.

- **Each night.** A quote shows each night of the stay, in date order, with its price as the quote priced it (request 15: a season's price, or the listing's), before any discount.
- **They add up.** The prices of the nights add up to the amount of the quote's nights line.
- **Bookings too.** A booking shows the nights of its quote. A change of dates (request 19) shows the nights of the new stay.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/quotes/{id}` | gains `nightlyPrices: [ { date, price } ]` |
| `GET /v1/bookings/{id}` | gains `nightlyPrices`, as above |
