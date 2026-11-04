# 58. The host reviews the guest

Hosts want to know who they let in, and a review should not be an answer to the other one. The host reviews the traveller, and neither sees the other's review before writing their own.

- **Reviewing the guest.** The listing's host, or a manager of its organisation (request 24), reviews the traveller of a stay that took place, in the same window as the traveller's review (request 57: from the day after the check-out up to 14 days after it):
  - a `rating`, a whole number from 1 to 5;
  - a `comment` of 20 to 2,000 characters.

  A review by anyone else, of a stay that did not take place, or before or after that window, is refused.
- **Once.** A stay has one review of its guest, by the host or one manager, which never changes. Two sent at the same moment, to two servers, give one.
- **Hidden until both are written.** The two reviews of a stay, the traveller's and the host's, are published together: as soon as the second one is written, or when the window closes (today after check-out + 14 days) if one is missing, whichever comes first. Until then each one is read by its author only. This replaces request 57's rule, where a traveller's review waited for the window to close: it now waits for the host's review too, or for the window, whichever comes first.
- **A stay that took place,** as request 57 says: its booking is `confirmed` (not `cancelled`, not `lapsed`; one still unpaid past its payment's `dueBy` counts as lapsed), and its check-out date is before today. Today is OpenStay's date: the machine's time plus `CLOCK_OFFSET_DAYS` days.
- **A traveller's reviews.** Any signed-in account reads the published reviews of a traveller, the most recently written first.
- **On the booking.** Anyone who reads the booking (its traveller, the listing's host, the managers and viewers of its organisation) reads its two reviews, each one only when the caller wrote it or it is published.

The API works as request 1 says. The traveller's review is request 57's: `{ id, bookingId, authorId, cleanliness, accuracy, communication, comment, createdAt }`, written with `POST /v1/bookings/{id}/review`.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/guest-review` `{ rating, comment }` | creates the review, `{ id }` |
| `GET /v1/bookings/{id}/reviews` | `200 { traveller, host }`, each `null` when there is none or the caller may not read it yet |
| `GET /v1/accounts/{id}/guest-reviews` | `200 [ { id, bookingId, authorId, rating, comment, createdAt } ]`, the published reviews of that traveller, the most recently written first |
| `GET /v1/listings/{id}/reviews` | as request 57: published only |
