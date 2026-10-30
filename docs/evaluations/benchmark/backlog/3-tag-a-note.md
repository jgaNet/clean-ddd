# 3. Tags on a note

People label their notes and find them by label.

- The owner of a note adds a tag to it, and removes it. A tag is one lowercase word — letters `a`–`z`, digits and hyphens — of 1 to 30 characters; anything else is refused, never rewritten.
- A note carries at most 10 tags. Adding a tag the note already has is refused; so is removing a tag it does not have.
- An archived note cannot be tagged or untagged until it is restored.
- Each note shows its tags, in the order they were added. The owner lists their notes carrying one tag, in the same order as their list.

## The API

| Request | Answer |
| --- | --- |
| `POST /notes/{id}/tags` `{ tag }` | 202 |
| `DELETE /notes/{id}/tags/{tag}` | 202 |
| `GET /notes?tag={tag}` | 200, the caller's notes carrying that tag |
| `GET /notes`, `GET /notes/{id}` | each note gains `tags: string[]` |
