# 18. Arrival and departure days

Some places turn over on Saturdays only.

- **The days.** A host sets on which days of the week a stay may start and on which it may end, each a non-empty list of `monday` … `sunday`. Every day is allowed until set. A day outside the seven, or an empty list, is refused.
- **What it refuses.** A quote whose check-in or check-out falls on a day the listing does not allow is refused. Days are those of the dates, in UTC.
- **Search.** A search for such dates does not find the listing.
- **Who.** Only the listing's host sets them.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/arrival-days` `{ checkInDays, checkOutDays }` | |
| `GET /v1/listings/{id}` | gains `arrivalDays: { checkInDays, checkOutDays }`, each in the order `monday` … `sunday` |
