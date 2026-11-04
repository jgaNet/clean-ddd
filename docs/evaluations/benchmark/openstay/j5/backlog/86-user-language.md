# 86. The user's language

A host in Lyon wants their notices in French, a traveller from Tokyo in Japanese. The notice service writes them; OpenStay tells it which language each person reads.

- **An account's language.** A tag as request 85 writes them: two or three letters, optionally a dash and a two-letter region (`en`, `fr`, `ja`, `en-GB`), case ignored when sent and answered with the language in lower case and the region in capitals. Anything else is refused. It is `en` until set, for every account, those created before this request included.
- **Setting it.** It may be given at sign-up, and the account changes it at any time. Only the account itself sets and reads it.
- **Every notice carries it.** Every notice OpenStay sends to `NOTIFY_URL` gains `lang`, the language of the account the notice is for, as it was when the notice arose:
  - a booking confirmed or requested (request 10, `{ id, kind, hostId, bookingId }`): the host's language;
  - a new message (request 55, `{ id, kind: "message", accountId, conversationId }`), a booking cancelled by the platform (request 66, `{ id, kind: "booking-cancelled", accountId, bookingId }`), an email to verify (request 76, `{ id, kind: "email-verification", accountId, email, code }`): the language of `accountId`;
  - and every notice of a later request, in the same way.
- **A notice does not change.** A notice not accepted is sent again with the same body (request 10), `lang` included: changing one's language afterwards changes only the notices that arise afterwards. A notice is still sent once, whatever a crash or a restart does, and only when its kind is on (request 75).
- **Nothing else changes.** OpenStay's answers keep their fields and their values, whatever the language.

The API works as request 1 says; the notices are request 10's: `POST {NOTIFY_URL}` with a JSON body, sent again until the service accepts it with a `2xx`.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/accounts` `{ email, password, roles, language }` | `language` may be left out: `en` |
| `PUT /v1/accounts/me/language` `{ language }` | |
| `GET /v1/accounts/me` | gains `language` |
| `POST {NOTIFY_URL}` | every notice's body gains `lang` |
