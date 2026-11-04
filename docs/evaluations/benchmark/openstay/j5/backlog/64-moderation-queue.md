# 64. The moderation queue

Reports must not pile up unread. Administrators go through them, oldest first, and close each one.

- **Administrators** are the accounts whose email is in `ADMIN_EMAILS`, a comma-separated list (request 37). Every route below answers `403` to anyone else.
- **What waits.** Every open report, whatever it is about, oldest first:
  - a message, reported by its recipient (request 56): kind `message`;
  - a published review, reported by an account other than its author (request 61): kind `review`;
  - a listing, reported by a signed-in account other than its host (request 63): kind `listing`.

  Each shows its `subjectId` (the message's, the review's or the listing's id), who reported it, the reason as it was given (for a listing, one of `inaccurate`, `scam`, `offensive`, `unsafe`, `other`), the `details` given with a listing's report (`null` when none, and for the other kinds), and when it was made.
- **Closing a report.** An administrator dismisses a report or upholds it, with a note of 1 to 500 characters saying why. A closed report leaves the queue and cannot be closed again: a second dismissal or upholding is refused, and of two administrators closing the same report at the same moment, on one server or two, exactly one succeeds.
- **One subject, one decision.** Closing a report closes, the same way and with the same note, every other open report on the same subject: three reports of one listing upheld once are three reports upheld. A report made afterwards on the same subject is open again.
- **What upholding does** to the message, the review or the listing comes with request 65. Here, closing a report closes it, and nothing more.
- **Reading a report.** An administrator reads any report, open or closed: a closed one shows how it was closed, the note, who closed it and when.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/admin/reports` | `200 [ { id, kind, subjectId, reporterId, reason, details, createdAt } ]`, open reports only, the oldest first |
| `POST /v1/admin/reports/{id}/dismiss` `{ note }` | |
| `POST /v1/admin/reports/{id}/uphold` `{ note }` | |
| `GET /v1/admin/reports/{id}` | `200 { id, kind, subjectId, reporterId, reason, details, createdAt, status, note, closedBy, closedAt }`, `status` one of `open`, `dismissed`, `upheld`; `note`, `closedBy` and `closedAt` are `null` while open |
