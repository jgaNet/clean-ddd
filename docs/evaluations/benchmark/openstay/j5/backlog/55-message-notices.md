# 55. Notices of new messages

Nobody keeps OpenStay open all day. The other party learns that a message is waiting, without being flooded by a chatty conversation.

- **Who is told.** A new message in a conversation (request 51) sends a notice to the other side: to the traveller when the host or a manager writes; to the listing's host when the traveller writes. The sender is never told of their own message, and managers and viewers are never told.
- **The notice.** `POST {NOTIFY_URL}` with the JSON body `{ id, kind, accountId, conversationId }`: `id` the notice's own id, `kind` `message`, `accountId` the account told.
- **Not one per message.** Once an account has been sent a notice for a conversation, the new messages of that conversation send it nothing more for `MESSAGE_NOTICE_WINDOW_SECONDS` seconds (900 when that is not set), counted from that notice; they are not told later either. The first new message after that sends a new notice. Each account and each conversation counts on its own. Two messages sent at the same moment, to two servers on the same database, send one notice.
- **Delivered as request 10 delivers.** The notification service may refuse a notice or not answer within two seconds. A notice it has not accepted with a `2xx` is sent again, with the same body and id, until it is accepted: the first retry within a second of the failure, each later one at most five seconds after the previous attempt ended. A notice accepted is not sent again. A server killed at any moment and started again on the same database sends, in the end, the notice of every message it recorded, and none for a message it did not record.
- **Without `NOTIFY_URL`,** nothing is sent, as before.

The API works as request 1 says; the notices go to the service of request 10.

## The API

No route changes. The server is started as before, with `MESSAGE_NOTICE_WINDOW_SECONDS` in its environment when it is not 900.
