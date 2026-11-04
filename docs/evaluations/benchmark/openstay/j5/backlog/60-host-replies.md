# 60. The host's reply

A host who was reviewed unfairly, or kindly, wants to answer where future guests will read it.

- **Replying.** The host of the reviewed listing, or a manager of its organisation (request 24), replies to a traveller's review (request 57) of that listing, with a text of 20 to 2,000 characters.
- **Published reviews only.** Only a review that is published (request 58: both reviews of the stay written, or the window closed 14 days after the check-out) can be replied to; a reply to one that is not yet is refused.
- **One, final.** A review has one reply at most, and it never changes: a second reply, by the host or by a manager, is refused. Two sent at the same moment, to two servers, give one.
- **Public.** The reply shows with the review, wherever the review shows, to anyone who reads it, with when it was written.
- **Not on a guest.** A host's review of a guest (request 58) has no reply, and the traveller replies to nothing: anything else is refused.

The API works as request 1 says. A review is request 57's: `{ id, bookingId, authorId, cleanliness, accuracy, communication, comment, createdAt }`, published as request 58 says, read at `GET /v1/listings/{id}/reviews` (published ones, the most recently written first) and `GET /v1/bookings/{id}/reviews`.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/reviews/{id}/reply` `{ text }` | |
| `GET /v1/listings/{id}/reviews` | each review gains `reply: { text, createdAt }`, or `null` |
| `GET /v1/bookings/{id}/reviews` | the traveller's review gains `reply` too |
