# 46. Receipts

Every movement of a traveller's money needs a receipt, numbered as the law asks.

- **A receipt.** Each payment that succeeds, and each refund that succeeds, gets a receipt: its number, its kind (`payment` or `refund`), the booking, the amount, and when.
- **Numbered.** Receipt numbers run from 1 across all of OpenStay, with no gap and no number given twice, in the order the provider's successes were handled. That holds for many payments succeeding at the same moment, across two servers, and across a crash.
- **Who.** A traveller lists their receipts, the most recent first.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/receipts/mine` | `200 [ { number, kind, bookingId, amount, at } ]`, the most recent first |
