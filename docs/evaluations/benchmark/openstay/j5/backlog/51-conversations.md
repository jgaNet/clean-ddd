# 51. Conversations

A traveller has a question before booking, or about a stay already booked. They write to the host, inside OpenStay, and only the people concerned read it.

- **Writing to a host.** A signed-in account writes to the host of a published listing, or of a listing it has a booking of (request 6, whatever the booking's status). In that conversation it is the traveller. The listing's host cannot write to their own listing.
- **One conversation per traveller and listing.** The first message starts it. Writing to the same listing again adds the message to the same conversation and answers its id. Even two first messages sent at the same moment, to two servers on the same database, make one conversation.
- **About a booking.** The traveller may name one of their own bookings of that listing: the conversation is then about it, and `bookingId` shows it. Naming another one later replaces it; `bookingId` is `null` until one is named. A booking that is not the caller's, or not of that listing, is refused.
- **A message** is a text of 1 to 2,000 characters.
- **Who reads, who writes.**
  - The traveller and the listing's host read the conversation and write in it.
  - When the listing belongs to an organisation (request 23), its managers (request 24) read and write too, for the host's side: a message a manager writes has the manager's own id as `senderId`. Its viewers read and write nothing.
  - To anyone else, the conversation does not exist (`404`).
- **In order.** Messages come back in the order they were sent, each with when it was sent (`sentAt`, a time as request 1 says).
- **Each person's list.** A signed-in account lists every conversation it may read, as traveller, host, manager or viewer, the most recent message first.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/conversations` `{ listingId, text, bookingId? }` | starts the conversation, or writes in the one that exists: `{ id }`, the conversation's |
| `POST /v1/conversations/{id}/messages` `{ text }` | |
| `GET /v1/conversations/{id}` | `200 { id, listingId, travellerId, hostId, bookingId, messages: [ { id, senderId, text, sentAt } ] }`, `hostId` the listing's host, messages in the order sent |
| `GET /v1/conversations/mine` | `200 [ { id, listingId, travellerId, hostId, lastMessageAt } ]`, the latest `lastMessageAt` first |
