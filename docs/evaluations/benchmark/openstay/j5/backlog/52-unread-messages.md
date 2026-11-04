# 52. Unread messages

A host with many conversations needs to see at a glance who is waiting for an answer.

- **Unread.** For each person who reads a conversation (request 51: the traveller, the listing's host, and the managers and viewers of its organisation), a message is unread until that person marks the conversation read. A message a person sent is never unread for them. A message sent by someone else on the same side (a manager, for the host) is unread for the host like any other.
- **Marking read.** A person who reads a conversation marks it read: every message in it so far is read for them, and for nobody else. A message sent after that is unread again. Reading the conversation (`GET`) marks nothing by itself.
- **Per conversation and in all.** Each conversation in the caller's list shows how many of its messages are unread for the caller; the total is the sum over every conversation the caller reads.
- **Who.** Each signed-in account, for itself. Marking a conversation the caller does not read is answered `404`, as request 51 says.

The API works as request 1 says. The conversations are request 51's: `GET /v1/conversations/mine` answers `[ { id, listingId, travellerId, hostId, lastMessageAt } ]`, the latest first.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/conversations/{id}/read` | |
| `GET /v1/conversations/mine` | each item gains `unread`, a count |
| `GET /v1/conversations/unread` | `200 { total }` |
