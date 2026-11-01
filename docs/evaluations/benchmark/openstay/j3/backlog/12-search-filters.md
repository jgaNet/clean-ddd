# 12. Search filters

Travellers narrow a search to what they can afford and what they need.

- **A highest nightly price.** A search may give one, in cents: only listings whose nightly price is at most that are found.
- **Amenities.** A search may name amenities, separated by commas: only listings that have every one of them are found.
- **Pets.** A search may ask for listings that allow pets.
- **The order does not change.** Filters only remove listings; what remains keeps the order request 3 states.
- **A filter that makes no sense is refused:** a highest price below 0, an amenity outside request 11's list.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/listings?city=…&maxPrice=&amenities=&pets=` | as request 3, filtered; `amenities` is a comma-separated list, `pets=true` keeps the listings that allow pets, and `pets` absent or `false` filters nothing; `400` for a filter that makes no sense |
