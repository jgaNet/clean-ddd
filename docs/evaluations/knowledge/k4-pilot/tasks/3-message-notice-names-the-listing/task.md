# The notice of a new message names the listing

When someone writes in a conversation, OpenStay sends the other side a notice through the outside notification
service, `{ id, kind: "message", accountId, conversationId }`. The notification service now wants to say which place
the message is about, without asking OpenStay again.

From now on, the notice of a new message also carries `listingId`: the id of the listing the conversation is about.
The notice is otherwise unchanged: who is told, how often, how it is delivered and retried. The other kinds of notice
do not change.
