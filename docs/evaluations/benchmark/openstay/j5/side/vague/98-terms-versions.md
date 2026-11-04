# 98. Versions of the terms

OpenStay's terms change from time to time. Administrators publish a new version; from then on, nobody books or publishes a listing until they have accepted it, and each booking should remember which version its traveller had accepted.

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
