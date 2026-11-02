# 45. Prices for many nights at once

A host who prices a year by hand wants to send it in one go.

- **Many nights.** A host sets the price of many nights of a listing in one request: a list of dates, each with its nightly price (at least 100 cents), up to 366 of them. Each one is a season of one night (request 15): it replaces what an earlier season said for that night.
- **All or nothing.** Either every night given takes its price, or none does: a date given twice, a date in the past, or a price below 100 cents refuses them all.
- **Kept as accepted.** Quotes and bookings already given keep their prices.
- **Who.** Only the listing's host, or a manager of its organisation.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/prices` `{ prices: [ { date, nightlyPrice } ] }` | |
