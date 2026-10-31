# 3. Search

Travellers look for a place to stay.

- **What they give.** A search names a city, and may give the dates of a stay and a number of guests.
  - The city matches whatever its case.
  - The dates are a check-in and a check-out, both given or neither. The stay is the nights from the check-in to the night before the check-out, and there is at least one night.
  - The number of guests is 1 when it is not given.

  Anyone may search, signed in or not.

- **What it finds.** Published listings in that city that take that many guests. A draft, a suspended or an archived listing is never found.
- **The order is stated, and the same for everyone.** It is not a ranking anyone can buy:
  1. the lowest nightly price first;
  2. then the listing published first;
  3. then by id.
- **Nights a listing cannot give.** Later requests bring blocked nights and bookings. A listing that cannot give every night of the stay asked for is not found by that search.
- **A search that makes no sense is refused:** no city, a check-out on or before the check-in, a number of guests below 1.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/listings?city=&checkIn=&checkOut=&guests=` | `200 [ { id, hostId, title, city, capacity, nightlyPrice, cleaningFee, cancellationPolicy, status } ]`, in the order above; `400` for a search that makes no sense |
