# 98. Versions of the terms

OpenStay's terms change from time to time. Everyone who books or publishes must have accepted the terms in force, and each booking must say which terms its traveller accepted.

- **Publishing a version.** An administrator (an account whose email is in `ADMIN_EMAILS`, a comma-separated list, request 37) publishes a version of the terms: a `version`, 1 to 20 letters, digits, dots or dashes, and a `text` of 1 to 100,000 characters. A version already published is refused: a version never changes. The version published last is the current one. There is none until an administrator publishes one.
- **Reading them.** Anyone, signed in or not, reads the current version and any version by its name.
- **Accepting.** A signed-in account accepts the current version. Accepting any other version, or one that does not exist, is refused. The account shows the version it accepted last, or `null`.
- **What needs it.** Once a version exists, an account that has not accepted the current one is refused:
  - a booking (requests 6 and 7: `POST /v1/bookings`), as the traveller;
  - publishing a listing (request 2), as its host or a manager of its organisation (request 24).

  Nothing else needs it: a quote, a hold, accepting a request, a change of dates, a cancellation, a payment go on as before. A new version asks everyone to accept again before their next booking or publication. A listing already published stays published.
- **Each booking keeps its version.** A booking shows `termsVersion`: the version its traveller had accepted when booking, which was the current one then. It never changes afterwards, whatever is published later. A booking made while no version existed, before this request included, shows `null`.
- **The audit log.** Each version published is an entry of the audit log (request 67), `{ id, at, adminId, action, subjectId, note }`: `action` `terms-published`, `subjectId` the version, `note` `null`. It is read at `GET /v1/admin/audit?subjectId=<version>`, oldest first.
- **Who.** Only administrators publish: the route answers `403` to anyone else.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/admin/terms` `{ version, text }` | |
| `GET /v1/terms` | `200 { version, text, publishedAt }`, the current version; `404` while there is none |
| `GET /v1/terms/{version}` | `200 { version, text, publishedAt }` |
| `POST /v1/accounts/me/terms/accept` `{ version }` | |
| `GET /v1/accounts/me` | gains `termsAccepted`, a version or `null` |
| `GET /v1/bookings/{id}` | gains `termsVersion`, a version or `null` |
