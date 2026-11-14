# Archiving a conversation (continued from another developer)

Another developer started this feature and had to stop half-way. Their work is the last commit on this branch. You
have nothing else from them: no notes and no conversation. Finish the feature.

**The feature.** A person who reads a conversation (the traveller, the listing's host, the managers and viewers of
its organisation) can archive it, for themselves only:

- `POST /v1/conversations/{id}/archive`, answered as every command of OpenStay is answered.
- An archived conversation is left out of the archiver's `GET /v1/conversations/mine`, until a new message is written
  in it, by anyone, the archiver included: then it is back in their list. Archiving it again changes nothing.
- The other people who read the conversation still have it in their list.
- An archived conversation is still read by its id, and its unread messages still count in
  `GET /v1/conversations/unread`.
- Archiving a conversation the caller does not read is refused, as any request about a conversation that does not
  exist for the caller; a caller who is not signed in is refused as for any other command.
