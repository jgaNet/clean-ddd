# 10. A note's history

Nothing written is lost: every edit keeps what it replaced.

- Every time a note's title or text is edited, the content it replaces is kept as a version.
- The owner lists a note's versions, most recent first. Each version has its number, title and text, and the time it stopped being current. Version 1 is the note as it was first written; each edit adds the next number.
- The owner restores a version. Restoring is an edit: the content it replaces becomes a version in turn.
- An archived note cannot be restored to a version, as it cannot be edited.
- Only the owner lists or restores versions.

## The API

| Request | Answer |
| --- | --- |
| `GET /notes/{id}/versions` | 200 `[{ version, title, text, replacedAt }]`, most recent first; 404 when the caller is not the owner or the note does not exist; 403 anonymous |
| `POST /notes/{id}/versions/{version}/restore` | 202; an `ERROR` outcome when the version does not exist or the note is archived |
