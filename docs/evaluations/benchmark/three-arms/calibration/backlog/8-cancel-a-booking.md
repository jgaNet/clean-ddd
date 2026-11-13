# 8. Cancel a booking

Plans change. A confirmed booking can be cancelled, and the cancellation says what is owed back. Nothing has been paid through OpenStay yet, so nothing is refunded here: what is owed and what was refunded are two different things, and they stay apart.

- **Who cancels.** The traveller who made the booking, or the listing's host. Only a confirmed booking is cancelled, and only once.
- **What is refundable.**
  - **The tourist tax** is refundable in full, always: no stay, no tax.
  - **When the host cancels,** everything is refundable.
  - **When the traveller cancels,** the rest of the total (the host's lines) follows the booking's cancellation policy, by how many days before the check-in the cancellation is made. Days count from today's date to the check-in date, in UTC.

    | Policy     | Refundable share of the host's lines                                                |
    | ---------- | ----------------------------------------------------------------------------------- |
    | `flexible` | all of it, 1 day or more before; nothing on the day of check-in                     |
    | `moderate` | all of it, 5 days or more before; half, from 1 to 4 days before; nothing on the day |
    | `strict`   | half, 7 days or more before; nothing after                                          |

    A half is half of the host's lines added together, rounded down to the cent.
- **The policy is the one the booking was made under.** If the host changes the listing's policy afterwards, the bookings already made keep theirs.
- **After the cancellation:**
  - the booking reads as `cancelled`, with who cancelled it, when, and the refundable amount;
  - its refund reads as `owed`, never as `refunded`, since nothing was paid;
  - its nights are free again.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/cancel` |  |
| `GET /v1/bookings/{id}` | `status` may now be `cancelled`; a cancelled booking also has `cancellation: { by, at, refundable }` and `refund: { amount, status }`. `by` is `traveller` or `host`; the refund's `amount` is what is owed back, and its `status` is `owed` |
