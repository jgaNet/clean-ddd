# 2. Publish a listing

Hosts describe the places they let. A place is a listing.

- **Creating a listing.** A host creates one with:
  - a title of 1 to 100 characters, not only spaces;
  - a city, not blank;
  - a capacity, the most guests it takes, from 1 to 16;
  - a nightly price, at least 100 cents;
  - a cleaning fee, 0 or more;
  - a cancellation policy: `flexible`, `moderate` or `strict`. What each one means comes with cancellations.

  It starts as a draft. An account that is not a host cannot create one.

- **Changing it.** Only its host changes a listing. The host may replace its description (every field above) at any time, until it is archived.
- **Its life.**
  - The host publishes a draft, and travellers can then find and book it.
  - A published listing may be suspended: nobody can book it while it is, and the host may publish it again.
  - A listing is archived from any state, and an archived one changes no more.
  - Anything else is refused: publishing an archived listing, suspending one that is not published.
- **Who sees it.**
  - A published listing is seen by anyone, signed in or not.
  - A draft, a suspended or an archived one is seen by its host only. To anyone else it does not exist.
- **The host's listings.** The host lists their own listings, whatever their state, the most recently created first.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/listings` `{ title, city, capacity, nightlyPrice, cleaningFee, cancellationPolicy }` | creates the listing, `{ id }` |
| `PUT /v1/listings/{id}` `{ title, city, capacity, nightlyPrice, cleaningFee, cancellationPolicy }` | replaces its description |
| `POST /v1/listings/{id}/publish` |  |
| `POST /v1/listings/{id}/suspend` |  |
| `POST /v1/listings/{id}/archive` |  |
| `GET /v1/listings/{id}` | `200 { id, hostId, title, city, capacity, nightlyPrice, cleaningFee, cancellationPolicy, status }`, with `status` one of `draft`, `published`, `suspended`, `archived` |
| `GET /v1/listings/mine` | `200 [ { id, hostId, title, city, …, status } ]`, the most recently created first |
