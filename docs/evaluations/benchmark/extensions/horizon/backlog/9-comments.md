# 9. Comments on a note

People discuss a note: its owner and the accounts it is shared with comment on it.

- A signed-in person comments on a note they can read: theirs, or one shared with them. A comment is a text: required, at most 500 characters.
- An archived note takes no new comment; its comments stay readable.
- Everyone who can read the note lists its comments, oldest first, each with its author and when it was written.
- Nobody else can comment on a note or read its comments; an anonymous caller can do neither.

## The API

| Request | Answer |
| --- | --- |
| `POST /notes/{id}/comments` `{ text }` | 202; outcome's `result`: the comment id; an `ERROR` outcome when refused |
| `GET /notes/{id}/comments` | 200 `[{ id, authorId, text, createdAt }]`, oldest first; 404 when the caller cannot read the note; 403 anonymous |
