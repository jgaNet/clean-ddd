# 84. Countries

OpenStay now lets places beyond France. A traveller wants to know which country a place is in, and the rules of a country will follow it.

- **A listing's country.** A two-letter code, ISO 3166-1 alpha-2, in capitals, one of: `AT`, `BE`, `CH`, `DE`, `ES`, `FR`, `GB`, `IE`, `IT`, `JP`, `LU`, `NL`, `PT`, `US`. Any other code, or one in lower case, is refused.
- **Setting it.** The host gives it when creating the listing, or sets it later; a listing created without one is in `FR`. Every listing created before this request is in `FR`.
- **Who.** The listing's host, or a manager of its organisation (request 24). An archived listing changes no more (request 2).
- **Where it shows.** On the listing (`GET /v1/listings/{id}`), in search results (request 3) and in the host's list of their listings (request 2), as `country`.
- **A change of address.** Changing a listing's country to another one, like changing its city (request 70), makes it `verified: false` and `verifiedAt: null` again, until an administrator verifies it again. Sending the same country keeps the verification.
- **Nothing else changes.** Search still matches the city (request 3), whatever the country. `PUT /v1/listings/{id}` (request 2) does not touch the country. Quotes, bookings and prices are as before.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/listings` `{ title, city, capacity, nightlyPrice, cleaningFee, cancellationPolicy, country }` | `country` may be left out: `FR` |
| `PUT /v1/listings/{id}/country` `{ country }` | |
| `GET /v1/listings/{id}`, `GET /v1/listings?…`, `GET /v1/listings/mine` | each listing gains `country` |
