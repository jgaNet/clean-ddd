# 74. Support

When something is wrong that no screen fixes, people need to reach someone at OpenStay and get an answer.

- **A ticket.** Any signed-in account opens a ticket with a subject of 1 to 200 characters and a text of 1 to 2,000, neither only spaces. The text is the ticket's first message. The ticket is `open`.
- **Messages.** The ticket's account and the administrators (the accounts whose email is in `ADMIN_EMAILS`, request 37) add messages of 1 to 2,000 characters. They are kept in the order they were written, each with its author's id and when.
- **Its status.**
  - An administrator's message makes it `answered`.
  - A message from its account makes it `open` again.
  - Its account or an administrator closes it: `closed`. Closing a closed ticket changes nothing.
  - A message on a closed ticket reopens it: `open` when its account writes, `answered` when an administrator does.
- **Who sees it.** A ticket is read by its account and by the administrators. To anyone else it does not exist (`404`): an account lists its own tickets only. Administrators list every ticket, or those of one `status`, the oldest first; administrator routes answer `403` to anyone else.
- **Not a decision.** Answering or closing a ticket is not an entry of the audit log (request 67).

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/support/tickets` `{ subject, text }` | creates the ticket, `{ id }` |
| `POST /v1/support/tickets/{id}/messages` `{ text }` | |
| `POST /v1/support/tickets/{id}/close` | |
| `GET /v1/support/tickets/{id}` | `200 { id, accountId, subject, status, createdAt, messages: [ { authorId, text, at } ] }`, `status` `open`, `answered` or `closed`, the messages the oldest first |
| `GET /v1/support/tickets/mine` | `200 [ { id, accountId, subject, status, createdAt } ]`, the most recently opened first |
| `GET /v1/admin/support/tickets?status=` | `200 [ { id, accountId, subject, status, createdAt } ]`, the oldest first; `status` may be left out; `400` for another value |
