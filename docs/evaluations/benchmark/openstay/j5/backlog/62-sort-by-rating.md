# 62. Sorting by rating

Travellers want to see the best-reviewed places first, when they ask for it, and to know which order they are looking at.

- **Asking for it.** A search (requests 3, 12 and 14) may give `sort=rating`. Without `sort`, or with `sort=default`, the order is the one search has always used, unchanged. Any other value of `sort` is a search that makes no sense: `400`.
- **The rating order.**
  1. the highest `rating.overall` first, as the listing shows it (request 59: the mean of the three criteria's averages over the listing's published reviews, rounded to one decimal);
  2. listings with no published review (`rating: null`) last;
  3. listings with the same `overall`, and the unrated ones among themselves, in the order search gives without `sort`.
- **Only the order changes.** The same listings are found, with the same fields, whatever the sort: the city or the area, the dates, the guests and the filters apply as before. The order is the same for everyone, and nobody can buy a place in it.
- **The order is stated.** Every search answer carries the header `X-Order`: `rating` when sorted by rating, `default` otherwise. The answer itself stays the array request 3 describes.
- **It follows the reviews.** A review published changes the order of the next search.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/listings?…&sort=rating` | `200 [ listing ]` in the rating order, with the header `X-Order: rating`; each listing carries `rating: { cleanliness, accuracy, communication, overall, count }` or `null` (request 59) |
| `GET /v1/listings?…` (no `sort`, or `sort=default`) | as before, with the header `X-Order: default` |
