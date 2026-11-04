# 56. Reporting a message

A message can be abusive, or a scam. Whoever receives it can report it, and stop seeing it at once.

- **Reporting.** A message is reported by someone on the other side of the conversation (request 51) from its sender: a message of the traveller by the listing's host or a manager of its organisation; a message of the host's side by the traveller. A viewer reports nothing, and nobody reports their own message.
- **A reason,** of 1 to 500 characters.
- **Once.** An account reports a message once; a second report of it by the same account is refused.
- **Hidden at once.** From the report on, the message is left out of the conversation for the reporter (`GET /v1/conversations/{id}`), and it no longer counts as unread for them (request 52). Everyone else who reads the conversation still sees it, and its sender too.
- **For the administrators.** The report is kept, open, with the message, the reporter, the reason and when it was made, until an administrator (an account whose email is in `ADMIN_EMAILS`, request 37) closes it. Reporting changes nothing else about the message.

The API works as request 1 says. The conversation is request 51's: `GET /v1/conversations/{id}` answers `{ id, listingId, travellerId, hostId, bookingId, messages: [ { id, senderId, text, sentAt } ] }`, read by the traveller, the listing's host and the managers and viewers of its organisation; `GET /v1/conversations/mine` gives each conversation's `unread` count, and `GET /v1/conversations/unread` their `total` (request 52).

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/messages/{id}/report` `{ reason }` | creates the report, `{ id }` |
| `GET /v1/conversations/{id}` | leaves out, for the caller, every message they reported |
