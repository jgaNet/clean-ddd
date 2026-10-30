# 11. Editors

The owner can let someone else write in a note, not only read it.

- When the owner shares a note, they choose a role: `reader`, the default and what sharing meant until now, or `editor`.
- Sharing again with the same account changes their role. Until now, sharing again was refused.
- An editor edits the note's title and text, restores one of its versions, and comments. An editor cannot archive or restore the note, pin, tag, share, or set a reminder on it.
- The owner's answer for a note lists its editors. An editor appears in `sharedWith` too.
- The note's versions say who made each edit.

## The API

| Request | Answer |
| --- | --- |
| `POST /notes/{id}/share` `{ accountId, role? }` | 202; `role` is `'reader'` (the default) or `'editor'`; sharing again changes the role |
| `PUT /notes/{id}` | allowed for the owner and for an editor |
| `POST /notes/{id}/versions/{version}/restore` | allowed for the owner and for an editor |
| `GET /notes/{id}/versions` | allowed for the owner and for an editor; each version gains `editedBy`: the account whose edit replaced it |
| `GET /notes/{id}` | the owner's answer gains `editors: string[]` (account ids) |
