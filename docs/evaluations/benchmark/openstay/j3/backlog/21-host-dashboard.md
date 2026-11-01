# 21. A host's dashboard

Hosts with several places want one view of them.

- **Bookings across listings.** A host lists the bookings of all their listings whose stay shares a night with a range of nights (from `from` to the night before `to`, as in request 4): requested and confirmed ones only, ordered by check-in date, then by listing id, then by booking id.
- **Occupancy.** For each listing they host, whatever its state, over a range of nights (from `from` to the night before `to`): how many nights the listing could be booked (the nights not blocked), how many of them confirmed bookings take, and the occupancy, the second as a whole percentage of the first, rounded down (0 when the first is 0). Listings are ordered by id.
- **Who.** A host sees the listings they host only. An account that is not a host is refused.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/hosts/me/bookings?from=&to=` | `200 [ booking ]`, as request 6 shows one, in the order above |
| `GET /v1/hosts/me/occupancy?from=&to=` | `200 [ { listingId, availableNights, bookedNights, occupancy } ]` |
