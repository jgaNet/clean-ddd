# 68. Suspicious accounts

Some behaviour is a warning sign: a traveller cancelling booking after booking in a day, or someone sending the same first message to many hosts in an hour. Administrators want to see who did that, and when, and then decide for themselves; the account itself should notice nothing.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/admin/flags` | `200 [ { id, accountId, kind, at } ]`, `kind` `many-cancellations` or `same-message`, the newest first |
