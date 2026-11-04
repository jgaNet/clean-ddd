# P2. No stay, no cleaning

A traveller who cancels early under a strict policy loses half the cleaning fee, for a flat nobody slept in. Hosts and travellers agree that this is wrong: no stay, no cleaning.

- **The cleaning fee is refundable in full,** whenever a booking is cancelled, by whoever, like the tourist tax (request 8). The cancellation policy now applies to the rest of the host's lines: the nights, with their discounts, the extra guests' fee and a promotion code's line (requests 16, 41, 43).
  - So under `strict`, 7 days or more before, the refundable amount is the tourist tax, the cleaning fee, and half of the rest of the host's lines added together, rounded down to the cent.
  - On the day of check-in, under any policy, it is the tourist tax and the cleaning fee.
- **From now on.** It holds for every cancellation made from now on, whatever the booking's date or policy.
- **The rest follows.** What a cancellation refunds through the provider (request 31), the receipt of that refund (request 46), and what is still due to the host and paid out (request 33) follow from the refundable amount, as before.
- **Seen by the host.** The earnings by month (request 48) show apart, as `cleaning`, the cleaning fees of the bookings charged that month, by when their payment succeeded, as `charged` is counted. They are part of `charged`; when a cleaning fee is refunded, that refund is counted in `refunded`, as any refund is.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/bookings/{id}` | `cancellation.refundable` as above |
| `GET /v1/hosts/me/earnings?year=YYYY&currency=` | `200 [ { month, currency, charged, cleaning, fees, refunded, paidOut } ]` |
