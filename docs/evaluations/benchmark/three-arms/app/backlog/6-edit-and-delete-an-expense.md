# 6. Edit and delete an expense

A wrong amount, a forgotten flatmate: an expense is corrected, or removed.

- **Who may.** The expense's payer, or the group's owner. Any other member is refused; to someone outside the group, the expense does not exist.
- **Editing.** An edit gives the expense again, whole: its description, amount, date and the members it is split between, under the same rules as when it is recorded (request 4). The payer stays the one who paid, even when the owner edits it, and is still one of the members of the split. The shares are computed again from what the edit gives.
- **Its version.** An expense has a version: 1 when it is recorded, and one more at each edit. An edit says which version it was made from, the one its author read. When the expense has changed since, the edit is refused: its author reads it again and decides.
- **Two edits at once.** Two people may edit the same expense at the same moment, from the same version, through the same server or two servers on the same database. Exactly one edit is kept; the other is refused, because the expense changed since it was read. Nothing of the refused edit is kept, and the balances add up to 0.
- **Deleting.** A deleted expense no longer exists: it is not read, and it counts in no balance.

The API works as request 1 says.

## The API

| Request                                                                            | Answer                                                         |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `PUT /v1/expenses/{id}` `{ description, amount, date, splitBetween, version }`     | replaces the expense, from `version`                           |
| `DELETE /v1/expenses/{id}`                                                         | deletes the expense                                            |
| `GET /v1/expenses/{id}`                                                            | the expense gains `version`, an integer, 1 when it is recorded |
