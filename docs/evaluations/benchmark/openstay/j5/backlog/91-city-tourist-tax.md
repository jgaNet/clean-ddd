# 91. Tourist tax set by the city

Cities set their tourist tax themselves, and it is not always a fixed amount per guest. Where OpenStay knows a city's rule, the quote applies it, rather than each host's own figure.

- **The tax until now.** A host declares a listing's tourist tax, per guest and per night (request 5: `PUT /v1/listings/{id}/tourist-tax` `{ perGuestPerNight }`, shown as `touristTax`). The quote has one line for it, `for` `external`: the guests times the nights times that amount. This stays exactly so for every listing in a city that has no rule.
- **A city's rule.** An administrator (an account whose email is in `ADMIN_EMAILS`, a comma-separated list, request 37) sets a city's rule, of one of two kinds:
  - `per-guest-night`: an `amount` per guest and night, 0 or more;
  - `percent`: a `percent`, a whole number from 1 to 10, of each night's price per guest, capped at `capPerGuestNight` (0 or more) per guest and night.

  Either kind may give `childrenUnder` (1 to 18): children younger than that are exempt. Without it, or with `null`, nobody is exempt. Setting a city's rule again replaces it. No city has a rule until an administrator sets one, and there is no removing one.
- **Which listings.** Every listing whose `city` is that city, whatever its case, as search matches it (request 3), whatever its country (request 84). The rule applies to the quotes made after it is set. The host's own declaration stays on the listing, unused while its city has a rule.
- **Children.** A quote may say how many of its guests are `children`: younger than the age the city exempts. It is 0 when not given; more children than guests is refused. Children are guests for everything else (the capacity, the extra guests' fee of request 41). Where the city exempts nobody, or has no rule, `children` changes nothing.
- **The amount.** The taxable guests are the guests less the children (all the guests when nobody is exempt).
  - `per-guest-night`: the taxable guests times the nights times the `amount`.
  - `percent`: for each night, its price as the quote's `nightlyPrices` shows it (request 44: a season's price or the listing's, before any discount; neither the cleaning fee nor the extra guests' fee), divided by all the guests (children included), times the percent, rounded down to the cent, and at most `capPerGuestNight`. That is the tax per guest for the night; times the taxable guests, it is the night's tax. The line is the sum of the nights' taxes.
  - For example: a night at 12 000 cents, 3 guests of whom 1 child, 5 %, a cap of 250: 12 000 ÷ 3 × 5 % = 200 per guest, under the cap; 2 taxable guests, 400 for the night.
- **Still one line.** The tax stays one line, `for` `external`, and the total is the sum of the lines, as before. A rule's amounts are in the listing's currency, in its minor units (request 87).
- **What follows.** A quote or a booking already given keeps its tax. A booking keeps its quote's `children`. A change of dates (request 19) is priced as a quote would be today, with the booking's `children`. The tax collected (request 38) is the bookings' tax line, as before.
- **Seen on the listing.** `GET /v1/listings/{id}` shows its city's rule, as `cityTouristTax`, or `null` when the city has none.
- **The audit log.** Each rule set is an entry of the audit log (request 67), `{ id, at, adminId, action, subjectId, note }`, with `action` `city-tourist-tax-set`, `subjectId` the city in lower case, and `note` `null`. It is read at `GET /v1/admin/audit?subjectId=<city in lower case>`, oldest first.
- **Who.** Only administrators set a rule: the route answers `403` to anyone else.

The API works as request 1 says. `{city}` in a route is the city's name, URL-encoded.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/admin/cities/{city}/tourist-tax` `{ kind: "per-guest-night", amount, childrenUnder }` or `{ kind: "percent", percent, capPerGuestNight, childrenUnder }` | `childrenUnder` may be left out |
| `POST /v1/quotes` `{ listingId, checkIn, checkOut, guests, code, children }` | `children` may be given |
| `GET /v1/quotes/{id}`, `GET /v1/bookings/{id}` | gain `children` |
| `GET /v1/listings/{id}` | gains `cityTouristTax`: `{ kind, amount, childrenUnder }` or `{ kind, percent, capPerGuestNight, childrenUnder }`, `childrenUnder` `null` when nobody is exempt; or `null` |
