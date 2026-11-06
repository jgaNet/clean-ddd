# 71. Claims after a stay

Something went wrong during a stay: a broken window, a flat that was not as described. The traveller or the host asks for amends, the other one answers, and someone neutral decides.

- **A stay that took place.** A booking whose `status` is `confirmed` (not `cancelled`, not `lapsed`) and whose check-out date has passed: today is after the check-out. Today is the server's date, moved by `CLOCK_OFFSET_DAYS` (request 57): the server takes as now the machine's time plus that many days (0 when that is not set).
- **Opening a claim.** The booking's traveller, or its host side (the listing's host, or a manager of its organisation, request 24), opens a claim on a stay that took place, from the day after the check-out up to 14 days after it (today ≤ check-out + 14). It says an amount, in cents, of at least 1, and a description of 1 to 2,000 characters, not only spaces. The claim says who opened it: `traveller` or `host`.
- **One at a time.** A booking has at most one claim not yet decided: opening a second one while one is `open` or `answered` is refused. Once it is decided, another may be opened, within the same 14 days.
- **The answer.** The other side (the traveller, when the host side opened it; the host side, when the traveller did) answers once, with a text of 1 to 2,000 characters. The claim is then `answered`. A second answer, an answer by the side that opened it, or an answer to a decided claim is refused.
- **The decision.** An administrator (an account whose email is in `ADMIN_EMAILS`, request 37) decides an `open` or `answered` claim: for the `traveller`, for the `host`, or `rejected`, with a note of 1 to 500 characters saying why. The claim is then `decided`, and is decided once: a second decision is refused. Deciding moves no money in this request.
- **The audit log.** Each decision is an entry of the audit log (request 67): `{ id, at, adminId, action, subjectId, note }` with `action` `claim-decided`, `subjectId` the claim's id and `note` the decision's note. It is read at `GET /v1/admin/audit?subjectId=<claim id>`.
- **Who reads a claim.** The booking's traveller, whoever may read the booking as its host side (the host, the managers and viewers of its organisation), and the administrators. To anyone else it does not exist (`404`). The administrators list the claims waiting for a decision (`open` and `answered`), the oldest first. Administrator routes answer `403` to anyone else.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/bookings/{id}/claims` `{ amount, description }` | creates the claim, `{ id }` |
| `GET /v1/bookings/{id}/claims` | `200 [ claim ]`, the booking's claims, the oldest first |
| `POST /v1/claims/{id}/answer` `{ text }` | |
| `GET /v1/claims/{id}` | `200 { id, bookingId, openedBy, amount, description, createdAt, answer, status, decision }`: `openedBy` `traveller` or `host`; `answer` is `{ text, by, at }` or `null`, `by` the id of the account that answered; `status` `open`, `answered` or `decided`; `decision` is `{ outcome, note, at }` or `null` |
| `POST /v1/admin/claims/{id}/decide` `{ outcome, note }` | `outcome` `traveller`, `host` or `rejected` |
| `GET /v1/admin/claims` | `200 [ claim ]`, the `open` and `answered` claims, the oldest first |
