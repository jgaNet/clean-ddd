# 73. Proof of a direct payment

A traveller who paid by bank transfer wants to show it, and to keep the booking while the host checks. The host says whether the money came. OpenStay never claims to know.

- **The booking's payment.** As request 27 says: a confirmed booking shows a payment `due` until it is paid, with `dueBy` (request 30), past which an unpaid booking lapses at the next sweep (`JOBS_INTERVAL_SECONDS`, 60 when not set). A host may declare it paid directly (request 36): `declared`, `verified: false`.
- **Sending a proof.** The booking's traveller sends a file as proof of a transfer, while the booking's payment is `due`: the raw file as the body (`Content-Type: application/octet-stream`), its name in `name` (1 to 255 characters). The file is a PDF, a JPEG or a PNG, recognised by its first bytes and not by its name (`%PDF-` for `application/pdf`; `FF D8 FF` for `image/jpeg`; `89 50 4E 47 0D 0A 1A 0A` for `image/png`), of at most 5 MB (5,242,880 bytes). Anything else is refused, and so is a second proof for the same booking.
- **While the host checks.** The payment gains `transfer: { status: "proof-sent", proof: { id, name, type, size }, at }`, `at` when the proof was sent. While the transfer is `proof-sent` or `unconfirmed`, the booking does not lapse, and paying it through the provider (request 27) is refused.
- **The host confirms.** The listing's host, or a manager of its organisation (request 24), confirms: the payment becomes `declared` with `verified: false`, exactly as request 36 declares it (it no longer lapses, is never paid through the provider, gives no payout), and the transfer reads `confirmed-by-host`.
- **Or contests.** The same host side contests, with a reason of 1 to 500 characters: the transfer reads `contested`, and the payment is `due` again under its original `dueBy`. A booking whose `dueBy` has passed lapses at the next sweep, as request 30 says, unless it is paid through the provider or declared paid first.
- **Unconfirmed.** A proof neither confirmed nor contested within `TRANSFER_CONFIRM_DAYS` days of `at` (7 when not set) reads `unconfirmed`, as soon as that time has passed, with nobody acting. The booking still does not lapse, and the host may still confirm or contest. Confirming or contesting a transfer that is neither `proof-sent` nor `unconfirmed` is refused. Days follow `CLOCK_OFFSET_DAYS` (request 57): the server takes as now the machine's time plus that many days.
- **Never verified.** A proof is the traveller's word. Nothing makes a transfer, or a payment declared from it, `verified`: `verified` is `true` only for a payment the provider said succeeded.
- **The file.** The traveller and whoever may read the booking as its host side download the proof, byte for byte, with its type as `Content-Type`; to anyone else it does not exist (`404`).

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/transfer-proof?name=<file name>` with the file as the body | `{ id, type, size }`, the proof's |
| `POST /v1/bookings/{id}/transfer/confirm` | |
| `POST /v1/bookings/{id}/transfer/contest` `{ reason }` | |
| `GET /v1/bookings/{id}` | `payment` gains `transfer: { status, proof: { id, name, type, size }, at }`, or `null`; `status` `proof-sent`, `confirmed-by-host`, `contested` or `unconfirmed` |
| `GET /v1/bookings/{id}/transfer-proof` | `200`, the proof's bytes, with its type as `Content-Type`; `404` while there is none |
