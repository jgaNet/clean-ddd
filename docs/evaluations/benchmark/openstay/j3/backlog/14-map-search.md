# 14. Search on a map

Travellers look at a map, not only at a city.

- **A listing's location.** Its host places it: a latitude from −90 to 90 and a longitude from −180 to 180, in degrees. A listing has no location until placed.
- **A search by area.** A search may give an area instead of a city, or with one: a box of a southern and a northern latitude and a western and an eastern longitude. Only listings placed inside the box (its edges included) are found. A listing with no location is never found by an area.
- **Everything else holds.** The dates, the guests, the filters and the order of requests 3 and 12 apply as before.
- **A search that makes no sense is refused:** neither a city nor an area, a box whose south is above its north or whose west is east of its east, a coordinate out of range or not a number, a box with some of its four edges and not all.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/location` `{ latitude, longitude }` | |
| `GET /v1/listings/{id}` | gains `location: { latitude, longitude }`, or `null` until placed |
| `GET /v1/listings?south=&west=&north=&east=&…` | as request 3; `city` may be left out when an area is given |
