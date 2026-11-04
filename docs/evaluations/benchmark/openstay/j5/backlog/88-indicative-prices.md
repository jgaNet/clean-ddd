# 88. Indicative prices

A traveller from London wants to know roughly what a stay in Paris costs in pounds. OpenStay shows it, marked as indicative: the stay is still booked and paid in the listing's currency.

- **The currencies,** as request 87 says: a listing is priced in `EUR`, `GBP`, `CHF` or `JPY`, and every amount is an integer in its minor unit (cents, pence, centimes; yen for `JPY`, which has none smaller).
- **The rates.** An administrator (an account whose email is in `ADMIN_EMAILS`, a comma-separated list, request 37) sets how much of `GBP`, `CHF` and `JPY` one euro buys: each a number above 0, with at most 6 decimals. Setting them replaces them all; a currency left out has no rate. `base` is always `EUR`; any other, or a rate for another currency, is refused. There is no rate until set. Anyone reads the rates.
- **Asking for a currency.** A search (requests 3, 12, 14) or the reading of a quote (request 5) may give `display`, one of the four currencies; any other is refused with `400`. Each listing found then gains `indicative: { currency, nightlyPrice, rate }`, and the quote `indicative: { currency, total, rate }`:
  - `rate` is how much of the display currency one unit of the listing's currency buys: the display currency's rate divided by the listing's (a euro's rate is 1), rounded to 6 decimals;
  - the amount is the listing's nightly price, or the quote's total, converted at the rates themselves (not the rounded `rate`), computed exactly and rounded half up once, to the display currency's minor unit. For example, at `GBP` 0.85 and `JPY` 160: a total of 12,345 euro cents is 10,493.25, so 10,493 pence; 10,000 euro cents is ¥16,000; ¥16,000 is 10,000 euro cents.
  - It is at the rates of the moment it is read: the quote's own terms never change (request 5), its indicative amount follows the rates.
  - It is absent when `display` is the listing's own currency, or when either currency has no rate.
- **Indicative only.** Nothing else changes: the search finds the same listings in the same order, the quote keeps its lines and total, and the booking and its payment are in the listing's currency, as before.
- **The audit log.** Each setting of the rates is an entry of the audit log (request 67), `{ id, at, adminId, action, subjectId, note }`: `action` `rates-set`, `subjectId` `rates`, `note` `null`. It is read at `GET /v1/admin/audit?subjectId=rates`, oldest first.
- **Who.** Only administrators set the rates: the route answers `403` to anyone else.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/admin/rates` `{ base: "EUR", rates: { GBP, CHF, JPY } }` | any of the three may be left out |
| `GET /v1/rates` | `200 { base: "EUR", rates }`, `rates` `{}` until set |
| `GET /v1/listings?…&display=` | each listing gains `indicative`, as above |
| `GET /v1/quotes/{id}?display=` | gains `indicative`, as above |
