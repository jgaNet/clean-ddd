# 8. Team spaces

People work in teams. A team has a space: its members, their roles, its notes, its plan, its activity; its members find its notes with everything else they can read.

**Spaces and members**

- A signed-in person creates a space, with a name of 1 to 60 characters, and is its first admin. They list the spaces they are a member of, most recent first, with their role in each; a member reads a space's details: its members with their roles, and its pending invitations.
- Three roles: a *reader* reads the space's notes; an *editor* also writes notes in the space, and edits, archives and restores any of them; an *admin* also invites, removes members and changes their roles. A space always keeps at least one admin: removing, demoting or the leaving of its last admin is refused.
- An admin invites an existing account, by its id, with a role. Inviting an account that does not exist, a member, or an account already invited and not yet answered is refused. The invited account accepts or declines; an invitation unanswered for 7 days expires and can no longer be accepted.
- An admin removes a member, or changes a member's role. A member leaves a space. A member who leaves or is removed loses access to the space at once; the notes they wrote stay with the space.

**Seats and plan**

- A space is on Free — 3 seats, 50 notes — until one of its admins switches it to Team with a number of seats they choose (no payment yet; Team has no note limit). Switching to a plan with fewer seats than the space has members is refused.
- Members take seats; a pending invitation does not. Accepting an invitation when no seat is left is refused.
- A space's notes count against the space's limit, never against anyone's personal quota.

**Notes in a space**

- An editor or an admin writes a note in a space; members list the space's notes, most recent first, and read each. A reader cannot write, edit, archive or restore one.
- Pinning, tagging, sharing and reminders stay personal: they are refused on a space's note.
- "My notes" lists one's personal notes only.

**Search**

- A signed-in person searches the notes they can read — their own, those shared with them, their spaces' — for words, in the title or the text, ignoring case; every word must appear. Archived notes are not found. The most recently changed come first. A member removed from a space stops finding its notes.

**Activity**

- A space's admins read its activity, most recent first: members invited, joined, removed, left, their role changed; notes written, edited, archived and restored in the space — each with who did it and when.

**Being told**

- The invited account is told of the invitation; a member is told when they are removed or when their role changes. These are notifications in the same list as before.

## The API

| Request | Answer |
| --- | --- |
| `POST /spaces` `{ name }` | 202; outcome's `result`: the space id |
| `GET /spaces` | 200 `[{ id, name, role }]`, the caller's spaces, most recent first |
| `GET /spaces/{id}` | 200 `{ id, name, members: [{ accountId, role }], invitations: [{ accountId, role, invitedAt }] }` for a member; 404 otherwise |
| `POST /spaces/{id}/invitations` `{ accountId, role }` | 202; `role` is `reader`, `editor` or `admin` |
| `POST /spaces/{id}/accept`, `POST /spaces/{id}/decline` | 202: the caller answers their pending invitation to that space |
| `POST /spaces/{id}/members/{accountId}/remove` | 202 |
| `POST /spaces/{id}/members/{accountId}/role` `{ role }` | 202 |
| `POST /spaces/{id}/leave` | 202 |
| `GET /plans/spaces/{id}` | 200 `{ plan: 'free', seats: 3, noteLimit: 50 }` or `{ plan: 'team', seats, noteLimit: null }` for a member; 404 otherwise |
| `PUT /plans/spaces/{id}` `{ plan, seats }` | 202; `seats` is required for `team` |
| `POST /notes` `{ title, text, spaceId }` | 202; with `spaceId`, a note of that space |
| `GET /notes?space={id}` | 200, the space's notes, for a member; 404 otherwise |
| `GET /notes/{id}` | a space's note, for its members; each note gains `spaceId: string \| null` |
| `GET /search?q={words}` | 200 `[{ noteId, title, spaceId }]`, most recently changed first |
| `GET /audit/spaces/{id}` | 200 `[{ at, actorId, action, subject }]` for an admin, most recent first; 403 for anyone else. `action` is one of `member-invited`, `member-joined`, `member-removed`, `member-left`, `role-changed`, `note-written`, `note-edited`, `note-archived`, `note-restored`; `subject` is the account or the note |
| `GET /notifications` | gains `{ id, kind: 'space-invitation', spaceId, spaceName, role, invitedAt }`, `{ id, kind: 'space-removal', spaceId, spaceName, removedAt }`, `{ id, kind: 'space-role-changed', spaceId, spaceName, role, changedAt }` |

Every time is an ISO 8601 string.
