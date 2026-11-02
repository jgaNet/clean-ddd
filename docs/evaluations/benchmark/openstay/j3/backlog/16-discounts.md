# 16. Discounts for longer stays

Hosts reward travellers who stay longer.

- **The discounts.** A host sets a weekly and a monthly discount, each a whole percentage from 0 to 50. Both are 0 until set.
- **Which one applies.** A stay of 7 nights or more gets the weekly discount; one of 28 nights or more gets the monthly one instead. Shorter stays get none.
- **On what.** A discount applies to the nights, never to the cleaning fee or the tourist tax. Its amount is rounded down to the cent before it is made negative: 10 % of 70 007 cents is a line of −7 000.
- **On the quote.** A discount that applies is a line of its own, for the host, with a negative amount, named, and the total is the sum of the lines as before. A quote with no discount has no such line.
- **Kept as accepted.** Quotes and bookings already given keep what they showed.
- **Who.** Only the listing's host sets them.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/discounts` `{ weeklyPercent, monthlyPercent }` | |
| `GET /v1/listings/{id}` | gains `discounts: { weeklyPercent, monthlyPercent }` |
