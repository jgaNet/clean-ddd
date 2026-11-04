# 68. Suspicious accounts

Some behaviour is a warning sign: a traveller cancelling booking after booking, or someone sending the same message to many hosts. Administrators want to see it, and then decide for themselves.

- **Many cancellations.** An account is flagged `many-cancellations` when it cancels, as a traveller (request 8, `cancellation.by: "traveller"`), more than 3 bookings in 24 hours: at the cancellation that makes 4 or more in the 24 hours up to it.
- **The same message.** An account is flagged `same-message` when the same text, exactly, is the first message of its conversations (request 51, `POST /v1/conversations` starting a new conversation) with more than 5 different hosts in an hour: at the first message that makes 6 or more hosts in the hour up to it. A host is the listing's host: two listings of one host are one host. A message added to a conversation that already exists does not count.
- **One flag a day.** An account has at most one flag of each kind per day (UTC): a fifth cancellation the same day adds none; the same behaviour the next day adds a new one. That holds with two servers on one database, and for cancellations or messages sent at the same moment.
- **A flag decides nothing.** The flagged account signs in, books, cancels and writes as before. Nothing it can see changes, and nobody is told but the administrators who read the flags.
- **Time.** Now is as request 57 says: the machine's time plus `CLOCK_OFFSET_DAYS` days. A flag's `at` is the time of the cancellation or the message that raised it.
- **Who.** Administrators (the accounts whose email is in `ADMIN_EMAILS`, request 37) read every flag, the newest first. Anyone else gets `403`.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `GET /v1/admin/flags` | `200 [ { id, accountId, kind, at } ]`, `kind` `many-cancellations` or `same-message`, the newest first |
