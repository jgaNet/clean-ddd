# 4. Share a note

People share notes with each other.

- The owner of a note shares it with another account, by that account's id. A note can be shared with several accounts, each once: sharing again with the same account is refused. Sharing with an account that does not exist is refused; so is sharing an archived note, and sharing with yourself.
- An account a note is shared with can read it, and lists the notes shared with it, most recent first, with the owner's account id beside each. It cannot edit, archive, restore, pin, tag or share it.
- Reading a note's details shows its owner the accounts it is shared with.

## The API

| Request | Answer |
| --- | --- |
| `POST /notes/{id}/share` `{ accountId }` | 202 |
| `GET /notes/shared` | 200 `[{ id, title, text, archived, createdAt, ownerId, … }]`, most recent first |
| `GET /notes/{id}` | 200 for the owner and for an account it is shared with; each note gains `ownerId`; the owner's answer gains `sharedWith: string[]` (account ids) |
