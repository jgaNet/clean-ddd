# 15. Seasonal prices

A night in August is not a night in November. Hosts set different prices for different dates.

- **A season.** A host sets a nightly price for a range of 1 to 365 nights (from a date, up to the night before another), at least 100 cents. A later season replaces an earlier one on the nights they share. A host clears a range too, and those nights go back to the listing's nightly price.
- **The prices.** Anyone who can see the listing reads the price of each night of a range.
- **Quotes.** A quote's nights line is the sum of each night's own price. Quotes and bookings already given keep their prices.
- **Search.** The highest-price filter of request 12 still compares the listing's nightly price, not its seasons.
- **Who.** Only the listing's host sets and clears seasons.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/listings/{id}/seasonal-prices` `{ from, to, nightlyPrice }` | |
| `POST /v1/listings/{id}/seasonal-prices/clear` `{ from, to }` | |
| `GET /v1/listings/{id}/prices?from=&to=` | `200 [ { date, nightlyPrice } ]`, one per night, in date order |
