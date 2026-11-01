# 11. Amenities and house rules

Travellers want to know what a place offers and what it allows before they book, and what they accepted must stay as they accepted it.

- **Amenities.** A host declares a listing's amenities, from this list only: `wifi`, `kitchen`, `parking`, `washer`, `air-conditioning`, `heating`, `pool`, `workspace`. A listing has none until its host declares them. Declaring replaces the whole set; an amenity outside the list, or one named twice, is refused.
- **House rules.** A host declares whether pets, smoking and events are allowed (none of them, until declared), from what time guests may arrive, and before what time they leave, each as `HH:MM`, from `00:00` to `23:59` (`15:00` and `11:00` until declared); a time that is not one (`25:00`, `noon`) is refused.
- **Who.** Only the listing's host declares them, and an archived listing changes no more.
- **Kept as accepted.** A quote shows the house rules and the arrival and departure times as they were when it was given, and a booking keeps them as its quote showed them, whatever the listing says afterwards.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/amenities` `{ amenities }` | |
| `PUT /v1/listings/{id}/house-rules` `{ pets, smoking, events, checkInFrom, checkOutBefore }` | `pets`, `smoking` and `events` are booleans |
| `GET /v1/listings/{id}` | gains `amenities`, in the order of the list above, and `houseRules: { pets, smoking, events, checkInFrom, checkOutBefore }` |
| `GET /v1/quotes/{id}`, `GET /v1/bookings/{id}` | each gains `houseRules`, as above |
