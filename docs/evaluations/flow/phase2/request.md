People are told when a note shared with them is archived.

- Each time the owner of a note archives it, every account the note is shared with at that moment receives a notification. The owner, who archived it, receives none. A note shared with nobody notifies nobody.
- A note archived, restored and archived again gives one notification per archiving.
- A signed-in person lists their own notifications, most recent first: `GET /v1/notifications`. Each notification is exactly `{ id, noteId, noteTitle, archivedAt }` — its own id, the archived note's id and title, and when it was archived (ISO 8601). An anonymous caller is refused (403); nobody sees another person's notifications.
- Nothing else for now: no read status, no deleting.
