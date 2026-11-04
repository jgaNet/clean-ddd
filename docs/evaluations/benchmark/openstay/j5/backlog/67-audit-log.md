# 67. The audit log

When an administrator suspends someone or removes a review, the person concerned will ask why, and who decided. Every decision is written down, and nothing written is ever changed.

- **Every administrator decision is an entry,** in this request and every later one: who took it (`adminId`), when (`at`), what (`action`), about what (`subjectId`), and why (`note`, as the administrator gave it, or `null` for a decision that takes none). The actions so far:

  | `action` | The decision | `subjectId` | `note` |
  | --- | --- | --- | --- |
  | `report-dismissed` | reports dismissed (request 64) | the reported message, review or listing | the note |
  | `report-upheld` | reports upheld (requests 64 and 65) | the reported message, review or listing | the note |
  | `listing-reinstated` | a listing suspended by moderation published again (request 65) | the listing | the note |
  | `account-suspended` | an account suspended (request 66) | the account | the reason |
  | `account-reinstated` | an account reinstated (request 66) | the account | the note |

  Later requests add their own actions under the same rule, `listing-verified` (request 70) and the decision on a claim (request 71) first among them.
- **One decision, one entry.** Reports on the same subject closed together (request 64) are one entry. What a decision brings with it (a listing suspended, bookings cancelled and refunded) is part of that entry, not entries of their own. A decision that is refused writes nothing.
- **Written with the decision.** A decision that was answered as done has its entry, readable within a few seconds, even when the server is killed right after and started again, and an entry is never there for a decision that was not taken. With two servers on one database, each decision has exactly one entry.
- **Nothing changes, nothing goes.** No route changes or removes an entry. An entry stays when its subject changes or goes: a review removed, an account closed (request 50), a listing archived.
- **Reading it.** An administrator (an account whose email is in `ADMIN_EMAILS`, request 37) reads the entries about one subject, the oldest first. Anyone else gets `403`. A subject with no entry reads `[]`.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/admin/audit?subjectId=` | `200 [ { id, at, adminId, action, subjectId, note } ]`, the oldest first; `400` without `subjectId` |
