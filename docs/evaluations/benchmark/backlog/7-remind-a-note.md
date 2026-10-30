# 7. Remind a note at a time

The owner of a note asks to be reminded of it at a moment; when the moment comes, they are told.

- The owner schedules one reminder on a note, at a moment in the future. A moment in the past is refused; so is an archived note.
- Scheduling again replaces the reminder. Archiving the note cancels it. There is no other way to cancel one.
- When the moment has come, the owner finds a notification in their list of notifications. The accounts the note is shared with are not told. A reminder cancelled or replaced before its moment is never told; one whose moment had already come when the note was archived was told, and stays.
- The note's details show its reminder's moment, or none.
- The list of notifications stays most recent first: an archiving by when it happened, a reminder by its moment.

## The API

| Request | Answer |
| --- | --- |
| `POST /notes/{id}/reminders` `{ remindAt }` | 202; `remindAt` is an ISO 8601 string |
| `GET /notes/{id}` | each note gains `remindAt: string \| null` |
| `GET /notifications` | gains `{ id, kind: 'reminder', noteId, noteTitle, remindAt }`, exactly these fields, once its moment has come; `noteTitle` is the title when the reminder was scheduled |
