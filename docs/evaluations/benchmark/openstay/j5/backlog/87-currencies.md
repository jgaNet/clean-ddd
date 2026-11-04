# 87. Currencies

A host in London prices in pounds, one in Zurich in francs, one in Kyoto in yen. The traveller pays in the listing's currency, and every amount that follows from the stay stays in it.

- **A listing's currency.** One of `EUR`, `GBP`, `CHF`, `JPY`; any other is refused. The host (or a manager of its organisation, request 24) gives it when creating the listing, or sets it later. It is `EUR` until set, and every listing created before this request is in euros. Once the listing has a booking, whatever its status, or a quote still valid (request 25), changing it is refused.
- **Its minor unit.** Every amount stays an integer, in the currency's minor unit: cents of a euro, pence, centimes of a franc, and yen for `JPY`, which has none smaller (1 is ¥1). Every rule written in cents holds in that unit, with the same numbers: a nightly price of at least 100 (¥100 in yen, request 2), a host's refund of at least 1 (request 32), a half or a discount rounded down to the unit (requests 8, 16, 42, 43).
- **Everything from the listing is in its currency:**
  - its nightly price, cleaning fee and tourist tax (requests 2, 5), its seasons and prices (15, 45), its extra guests' fee (41);
  - a quote (5), its lines, total and nights' prices (44); the booking made from it (6, 7), its conditions (25), a cancellation's refundable amount (8);
  - the booking's payment and fee (27), its refunds (30, 31, 32), a claim's amount and refund (71, 72), a dispute (39);
  - the payout of a booking (33) and the receipts (46).

  A booking is in its quote's currency, and a change of dates (request 19) keeps it. Discount percentages and promotion codes (requests 16, 42, 43) are unchanged.
- **Bulk seasons.** Setting a season on several listings at once (request 22) is refused, for all of them, unless they share one currency.
- **Search.** A search finds listings in every currency. It may give `currency` to find only listings priced in it. The highest nightly price (`maxPrice`, request 12) is in the search's `currency` (`EUR` when not given), and keeps only listings in that currency. The order (request 3) never compares two currencies: listings come by currency, in the alphabetical order of its code (`CHF`, `EUR`, `GBP`, `JPY`), each currency in the order request 3 states. A search that finds only euros answers exactly as before.
- **Adding up several bookings never mixes currencies:**
  - the tourist tax collected (request 38) is one line per city and currency, cities in alphabetical order, then currencies;
  - the host's statement (request 35) and earnings by month (request 48) count the euro amounts only, as before;
  - a payout is in one currency: a booking's payout (request 33) in the booking's, and a weekly payout (request 47) never mixes two;
  - the reconciliation (request 37) matches movements by `type`, `reference` and `currency`;
  - the cost of payments (request 83) counts the payments of one currency, the one asked (`EUR` when not given);
  - the transparency page (request 82) counts every booking in `bookings`, the fees in euros in `providerFees` and `costPerBooking`, and the fees in other currencies in `otherProviderFees`.
- **Donations** (request 80) stay in euros.
- **The provider** (request 26) now takes a `currency` on every payment, refund and payout, `EUR` when none is given, and gives it back in every answer, every transaction and every webhook's `data`; its fee is in the payment's currency. A refund is in its payment's currency: another one is refused with `400`. OpenStay always sends the currency.

The API works as request 1 says; the provider's API is request 26's, with the currency:

| Provider request or webhook | |
| --- | --- |
| `POST /payments` `{ amount, currency, reference }` | `201 { id, amount, currency, reference, status: "requires_payment", payUrl }` |
| `POST /refunds` `{ payment, amount, currency, reference }` | `201 { id, payment, amount, currency, reference, status: "pending" }`; `400` when more than what is left, or another currency than the payment's |
| `POST /payouts` `{ account, amount, currency, reference }` | `201 { id, account, amount, currency, reference, status: "pending" }`; `400` when the account is not enabled |
| `GET /payments/{id}`, `GET /transactions?date=` | each gains `currency` |
| webhooks `payment.*`, `refund.*`, `payout.*`, `dispute.*` | `data` gains `currency` |

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/listings` `{ …, currency }` | `currency` may be left out: `EUR` |
| `PUT /v1/listings/{id}/currency` `{ currency }` | |
| `GET /v1/listings/{id}`, `GET /v1/listings?…&currency=`, `GET /v1/listings/mine`, `GET /v1/favourites` | each listing gains `currency`; search as above |
| `GET /v1/quotes/{id}`, `GET /v1/quotes/mine` | each quote gains `currency` |
| `GET /v1/bookings/{id}`, `GET /v1/bookings/mine`, `GET /v1/listings/{id}/bookings`, `GET /v1/hosts/me/bookings` | each booking gains `currency` |
| `GET /v1/bookings/{id}/conditions`, `GET /v1/bookings/{id}/refunds`, `GET /v1/claims/{id}`, `GET /v1/hosts/me/payouts`, `GET /v1/receipts/mine` | each version, refund, claim, payout and receipt gains `currency` |
| `GET /v1/hosts/me/tourist-tax?month=` | `200 [ { city, currency, collected } ]` |
| `GET /v1/admin/reconciliation?date=` | each mismatch gains `currency` |
| `GET /v1/admin/payment-costs?month=&currency=` | gains `currency` |
| `GET /v1/transparency?month=` | gains `otherProviderFees: [ { currency, amount } ]`, currencies in alphabetical order, only those with a fee |
