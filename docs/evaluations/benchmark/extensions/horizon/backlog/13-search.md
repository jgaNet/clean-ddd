# 13. Search

People find a note by what it says.

- A signed-in person searches the notes they can read: their own and those shared with them, archived ones excluded.
- A note matches when its title or its text contains every word of the query, ignoring case.
- Results come most recent first.
- An empty query is refused.

## The API

| Request | Answer |
| --- | --- |
| `GET /notes/search?q={words}` | 200 `[{ id, title, ownerId }]`, most recent first; 400 when `q` is missing or blank; 403 anonymous |
