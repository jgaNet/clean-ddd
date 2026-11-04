# 57. A review after a stay

Travellers choose a place by what earlier guests said of it. Only someone who stayed may say it, once, while the stay is fresh.

- **OpenStay's date.** OpenStay's time is now the machine's time plus `CLOCK_OFFSET_DAYS` days (an integer, 0 when not set). Every date and every deadline of every request reads it: today, now, every expiry and every due date, every time OpenStay records, and the work that runs every `JOBS_INTERVAL_SECONDS` (request 30). Two things keep the machine's own time: the age of a provider's webhook signature (request 26: more than five minutes old is refused), and two-factor sign-in codes (a later request). A server started again with a larger offset finds those days gone by; servers on one database run with the same offset.
- **A stay that took place.** A booking (request 6) whose status is `confirmed` (not `cancelled`, not `lapsed`, nor a request still waiting, declined or expired), and whose check-out date is before today. A booking still unpaid past its payment's `dueBy` (request 30) counts as lapsed, even before it reads so.
- **Reviewing.** The booking's traveller reviews a stay that took place, from the day after its check-out up to 14 days after it (today at most check-out + 14 days):
  - `cleanliness`, `accuracy` and `communication`, each a whole number from 1 to 5;
  - a `comment` of 20 to 2,000 characters.

  A review by anyone else, of a stay that did not take place, or before or after that window, is refused.
- **Once.** A stay has one review from its traveller, which never changes. Two sent at the same moment, to two servers, give one review; the other is refused.
- **Published when the window closes.** A review is published from the day its stay's window has closed (today after check-out + 14 days), whoever asks and without anyone acting. Until then only its author reads it, on the booking.
- **On the listing.** Anyone who can see a listing (request 2) reads its published reviews, the most recently written first.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/review` `{ cleanliness, accuracy, communication, comment }` | creates the review, `{ id }` |
| `GET /v1/bookings/{id}/reviews` | `200 { traveller }`, for anyone who reads the booking: the traveller's review when the caller wrote it or it is published, `null` otherwise |
| `GET /v1/listings/{id}/reviews` | `200 [ review ]`, published only, the most recently written first |

A review is `{ id, bookingId, authorId, cleanliness, accuracy, communication, comment, createdAt }`, `createdAt` when it was written.
