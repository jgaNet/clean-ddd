# 5. Notify recipients when a shared note is archived

People are told when a note shared with them is archived.

- Each time the owner of a note archives it, every account the note is shared with at that moment receives a notification. The owner, who archived it, receives none. A note shared with nobody notifies nobody.
- A note archived, restored and archived again gives one notification per archiving.
- A signed-in person lists their own notifications, most recent first. An anonymous caller is refused; nobody sees another person's notifications.
- Nothing else for now: no read status, no deleting.

## The API

| Request | Answer |
| --- | --- |
| `GET /notifications` | 200 `[{ id, kind: 'note-archived', noteId, noteTitle, archivedAt }]`, exactly these fields, most recent first; 403 anonymous |

`archivedAt` is an ISO 8601 string. A later feature adds notifications of another `kind` to the same list.
