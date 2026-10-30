# 2. Pin a note

People want their important notes first.

- The owner of a note pins it, and unpins it later. Pinning a note that is already pinned is refused; so is unpinning a note that is not pinned.
- An archived note cannot be pinned. Archiving a pinned note does not unpin it; an archived note can still be unpinned.
- In the owner's list of notes, pinned notes come first; within each group, most recent first. Each note says whether it is pinned.

## The API

| Request | Answer |
| --- | --- |
| `POST /notes/{id}/pin`, `POST /notes/{id}/unpin` | 202 |
| `GET /notes`, `GET /notes/{id}` | each note gains `pinned: boolean` |
