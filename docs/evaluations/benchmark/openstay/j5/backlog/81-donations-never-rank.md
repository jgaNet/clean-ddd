# 81. Donations never rank

A gift to OpenStay must never buy a better place in search, or anyone could pay for what the order promises is not for sale. Donors who wish to be thanked in public are; the others stay unnamed.

- **Donations, as request 80 says.** A signed-in account gives an amount in cents, at least 100, through the provider. A donation is `pending`, then `paid` once the provider says `payment.succeeded`, or `failed`. It is `public` or not (`false` unless given); a public one has a `name` of 1 to 100 characters, and one that is not public has `name` `null`. It may be given beside one of the donor's bookings (`bookingId`), and is still a payment of its own.
- **Search knows nothing of them.** Whoever gave, whatever they gave, beside a booking or alone, a search (requests 3, 12, 14 and 62) finds the same listings, in the same order, with the same fields and the same values as it would if nobody had given anything. That holds for a host who gives, for a traveller who gives when paying a stay on a listing, and for any amount.
- **Nothing shows who gave.** No listing, search result, rating (request 59), quote or booking says whether its host, its traveller or anyone gave, or how much. Only the donor reads their donations (request 80).
- **The donors.** Anyone, signed in or not, reads a month's public donations, those paid during that month (when the provider said `payment.succeeded`, in UTC, by OpenStay's time, request 57), each with its `name` and its `amount`: the largest first, and of two of the same amount, the one paid first. A donation that is not public is never listed, and neither is one still `pending`, or `failed`. Each donation is listed on its own: two donations under the same name are two entries.
- **Nothing more.** The list shows a name and an amount only: no account, no email, no booking.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/donors?month=YYYY-MM` | `200 [ { name, amount } ]`, in the order above; `[]` for a month with none; `400` without a valid month |
| `GET /v1/listings?…` | as before, whatever anyone gave |
