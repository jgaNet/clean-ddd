# 9. A booking's history, and who may contact whom

When something goes wrong, people need to know what happened to a booking, and in what order. A traveller's and a host's contact details are private until a stay is agreed.

- **The history.** Every change of a booking's state is kept with who made it and when, in the order it happened: requested, confirmed, declined, expired, cancelled.
  - **Who made it.** The account that acted, or nobody when nobody acted: an expired request, or a booking confirmed at once by the application. A booking confirmed at once has one entry, `confirmed`, made by nobody; a request starts with `requested`, made by its traveller.
  - **Who reads it.** The traveller and the host read a booking's history.
  - **Before this request.** Bookings made before this request have a history from the state they were in.
- **Contact.**
  - Once a booking is confirmed, its host sees the traveller's email, and its traveller sees the host's email.
  - Before that (a request, waiting), neither sees the other's.
  - A request that was declined or expired never shows them.
  - A cancelled booking that was confirmed still shows them.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/bookings/{id}/history` | `200 [ { status, by, at } ]`, the oldest first; `by` is an account id, or `null` |
| `GET /v1/bookings/{id}` | gains `contact: { email }`, the other party's, once the booking has been confirmed; before that, `contact` is absent or `null` |
