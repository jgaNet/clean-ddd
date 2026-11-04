# 59. Ratings

A traveller comparing ten flats reads a number before reading reviews.

- **A listing's rating.** From the published reviews of the listing (requests 57 and 58), and from nothing else:
  - `cleanliness`, `accuracy` and `communication`: the average of that criterion over those reviews, rounded half up to one decimal (4.25 is 4.3);
  - `overall`: the average of those three rounded averages, rounded half up to one decimal;
  - `count`: how many reviews.

  A listing with no published review has `rating: null`.
- **Where it shows.** On the listing, and on each listing a search finds (requests 3, 12 and 14). The search's order does not change.
- **Published only.** A review its author alone may read yet (request 58: until both reviews of the stay are written, or the window closes) counts for nothing. Once it is published, the rating follows at once, with no one acting, and a server started with a later `CLOCK_OFFSET_DAYS` that closes a window shows it.
- **A host's rating.** Across every listing the host hosts, whatever its state: `count`, the published reviews of them all; `overall`, computed as a listing's, over all those reviews together (not an average of the listings' ratings). A host with none has `overall: null` and `count: 0`. Anyone reads it, signed in or not; an id no account has is answered `404`.
- **Only the traveller's reviews.** A host's review of a guest (request 58) rates the guest, and counts for no listing and no host.

The API works as request 1 says. A published review is request 57's: `{ id, bookingId, authorId, cleanliness, accuracy, communication, comment, createdAt }`, each rating a whole number from 1 to 5.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/listings/{id}` | gains `rating: { cleanliness, accuracy, communication, overall, count }`, or `null` |
| `GET /v1/listings?…` | each listing found gains `rating`, as above |
| `GET /v1/hosts/{id}/rating` | `200 { overall, count }` |
