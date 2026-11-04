# 17. How soon, and how far ahead

Some hosts need notice before a guest arrives; none wants a booking three years out.

- **The window.** A host sets the fewest days of notice a stay needs (from 0 to 30; 0 until set) and how many days ahead a stay may start (from 1 to 730; 365 until set). Days count from today's date to the check-in date, in UTC. A notice longer than the advance is refused.
- **What it refuses.** A quote for a stay that starts with less notice, or further ahead, than the listing takes is refused.
- **Search.** A search for such dates does not find the listing.
- **Who.** Only the listing's host sets it.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/booking-window` `{ minNoticeDays, maxAdvanceDays }` | |
| `GET /v1/listings/{id}` | gains `bookingWindow: { minNoticeDays, maxAdvanceDays }` |
